// Bookings CRUD + lifecycle mutations.
//
// Source: reservations-automation
//   backend/tours/services/booking_service.py
//   backend/tours/routers/staff/bookings.py
//
// Staff-side booking lifecycle. PublicBooking flow
// (anonymous customer-facing) lives in public_booking.ts.
//
// Lifecycle states (per schema union):
//   pending → confirmed → cancelled (terminal)
//                            ↘ checked_in → completed (terminal)
//
// We expose:
//   - create (pending by default; supports staff override)
//   - list (paginated + filters)
//   - get (single + tour + customer hydrated)
//   - update (whitelisted fields only; refuses terminal states)
//   - cancel (sets status, frees customer.nextBookingDate if it was it)
//   - checkIn (confirmed → checked_in; records by/at)
//   - complete (checked_in → completed; bumps customer loyalty/vip)
//   - recordReview (post-tour review rating/comment)

import { v, ConvexError } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireMembership, requireRole } from "./lib/authz";
import { parseBookingTime } from "./lib/time";
import { logAudit } from "./lib/audit";
import {
	MAX_GUEST_NAMES_LEN,
	MAX_NOTES_LEN,
	MAX_PAYMENT_METHOD_LEN,
	MAX_SHORT_FIELD_LEN,
	assertFieldWithinLimit,
} from "./lib/validation";

// Whitelisted update fields — mirrors source's ALLOWED_BOOKING_UPDATE_FIELDS
// minus currency/conversion noise (we are cents-only).
const ALLOWED_UPDATE_FIELDS = new Set([
	"date",
	"startTime",
	"guests",
	"guestNames",
	"languageRequired",
	"notes",
	"depositAmountCents",
	"totalAmountCents",
	"paymentMethod",
]);

// Source: BusinessConstants.LOYALTY_POINTS_PER_BOOKING
const LOYALTY_POINTS_PER_BOOKING = 10;
// Source: BusinessConstants.VIP_THRESHOLD_VISITS
const VIP_THRESHOLD_VISITS = 5;

// ----- Queries -----

export const list = query({
	args: {
		page: v.optional(v.number()),
		pageSize: v.optional(v.number()),
		search: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("confirmed"),
				v.literal("checked_in"),
				v.literal("completed"),
				v.literal("cancelled"),
			),
		),
		tourId: v.optional(v.id("tours")),
		customerId: v.optional(v.id("customers")),
		dateFrom: v.optional(v.string()), // YYYY-MM-DD
		dateTo: v.optional(v.string()),
		// Filter by booking source ("direct", "viator", "airbnb", etc.)
		// — enables an OTA-only view for tour operators.
		source: v.optional(v.string()),
		sortBy: v.optional(
			v.union(
				v.literal("date"),
				v.literal("createdAt"),
				v.literal("totalAmountCents"),
			),
		),
		sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const pageSize = Math.min(args.pageSize ?? 20, 100);
		const page = Math.max(1, args.page ?? 1);
		const sortBy = args.sortBy ?? "date";
		const sortOrder = args.sortOrder ?? "desc";
		const order = sortOrder === "asc" ? "asc" : "desc";

		// Pick the right index based on which filter is present.
		// by_org_source_date leads with (org, source) — optimal for the
		// OTA source chip ("show only Viator bookings") that scans every
		// org booking when using by_org_date.
		// by_org_date leads with (org, date) — optimal for date ranges.
		// by_org leads with (org) — fallback when no specific filter.
		const all = await (args.source
			? ctx.db
					.query("bookings")
					.withIndex("by_org_source_date", (q) =>
						q
							.eq("organizationId", member.organizationId)
							.eq("source", args.source!),
					)
					.collect()
			: args.dateFrom || args.dateTo
				? ctx.db
						.query("bookings")
						.withIndex("by_org_date", (q) => {
							const eq = q.eq(
								"organizationId",
								member.organizationId,
							);
							if (args.dateFrom) return eq.gte("date", args.dateFrom);
							if (args.dateTo) return eq.lte("date", args.dateTo);
							return eq;
						})
						.collect()
				: ctx.db
						.query("bookings")
						.withIndex("by_org", (q) =>
							q.eq("organizationId", member.organizationId),
						)
						.collect());

		let filtered = all;
		if (args.status) {
			filtered = filtered.filter((b) => b.status === args.status);
		}
		if (args.tourId) {
			filtered = filtered.filter((b) => b.tourId === args.tourId);
		}
		if (args.customerId) {
			filtered = filtered.filter(
				(b) => b.customerId === args.customerId,
			);
		}
		if (args.dateFrom) {
			filtered = filtered.filter((b) => b.date >= args.dateFrom!);
		}
		if (args.dateTo) {
			filtered = filtered.filter((b) => b.date <= args.dateTo!);
		}
		if (args.source) {
			filtered = filtered.filter((b) => b.source === args.source);
		}
		if (args.search) {
			const q = args.search.toLowerCase();
			filtered = filtered.filter(
				(b) =>
					b.guestNames.toLowerCase().includes(q) ||
					b.notes.toLowerCase().includes(q) ||
					b.languageRequired.toLowerCase().includes(q),
			);
		}

		filtered.sort((a, b) => {
			const av = a[sortBy];
			const bv = b[sortBy];
			if (typeof av === "number" && typeof bv === "number") {
				return order === "asc" ? av - bv : bv - av;
			}
			const as = String(av ?? "");
			const bs = String(bv ?? "");
			return order === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
		});

		const total = filtered.length;
		const offset = (page - 1) * pageSize;
		const items = filtered.slice(offset, offset + pageSize);
		const hasNext = offset + pageSize < total;

		return {
			items,
			total,
			page,
			pageSize,
			hasNext,
			hasPrevious: page > 1,
		};
	},
});

/** List bookings assigned to a specific tourSchedule.
 *
 *  Used by the schedule detail page to show "who's booked on this
 *  schedule" without requiring operators to filter the global
 *  bookings list. Uses the `by_schedule` index.
 */
/**
 * Internal helper — fetches + enriches bookings for a schedule.
 * Caller is responsible for org-scoping (the public query does this
 * via requireMembership).
 *
 * Customer lookup is batched: dedupe the customerIds first, fetch
 * each unique customer once, then map back. For 50 bookings on a
 * schedule this is 1 booking query + N (unique customers) customer
 * queries instead of 1 + N (one per booking). Most schedules have
 * a small number of distinct customers so the savings are real.
 */
async function _listByScheduleRaw(ctx: QueryCtx, scheduleId: Id<"tourSchedules">) {
	const all = await ctx.db
		.query("bookings")
		.withIndex("by_schedule", (q) => q.eq("scheduleId", scheduleId))
		.collect();
	const active = all
		.filter((b) => b.status !== "cancelled")
		.sort((a, b) => a.startTime.localeCompare(b.startTime));
	const uniqueCustomerIds = [
		...new Set(active.map((b) => b.customerId)),
	];
	const customerDocs = await Promise.all(
		uniqueCustomerIds.map((id) => ctx.db.get(id)),
	);
	const customerById = new Map<Id<"customers">, NonNullable<typeof customerDocs[number]>>();
	for (const [i, id] of uniqueCustomerIds.entries()) {
		const c = customerDocs[i];
		if (c) customerById.set(id, c);
	}
	return active.map((b) => {
		const c = customerById.get(b.customerId);
		return {
			_id: b._id,
			date: b.date,
			startTime: b.startTime,
			guests: b.guests,
			status: b.status,
			customerName: c?.name ?? "",
			customerEmail: c?.email ?? "",
		};
	});
}

export const listBySchedule = query({
	args: {
		scheduleId: v.id("tourSchedules"),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		// SECURITY: scope to org even though the index lookup is keyed
		// on scheduleId (defense in depth — a malicious caller can't
		// read another org's bookings by guessing a scheduleId).
		const schedule = await ctx.db.get(args.scheduleId);
		if (!schedule) return [];
		if (schedule.organizationId !== member.organizationId) {
			throw new ConvexError(
				"Forbidden: schedule belongs to a different organization",
			);
		}
		return await _listByScheduleRaw(ctx, args.scheduleId);
	},
});

/**
 * Internal mirror of listBySchedule. Takes organizationId directly so
 * tests + cron jobs can call it without going through Better Auth.
 * The caller must pass the schedule's owning orgId; the helper
 * verifies before returning rows.
 */
export const internalListBySchedule = internalQuery({
	args: {
		scheduleId: v.id("tourSchedules"),
		organizationId: v.string(),
	},
	handler: async (ctx, args) => {
		const schedule = await ctx.db.get(args.scheduleId);
		if (!schedule) return [];
		if (schedule.organizationId !== args.organizationId) {
			throw new ConvexError(
				"Forbidden: schedule belongs to a different organization",
			);
		}
		return await _listByScheduleRaw(ctx, args.scheduleId);
	},
});

export const get = query({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const booking = await ctx.db.get(args.bookingId);
		if (!booking) return null;
		if (booking.organizationId !== member.organizationId) return null;
		const tour = await ctx.db.get(booking.tourId);
		const customer = await ctx.db.get(booking.customerId);
		return {
			...booking,
			tour: tour ? { _id: tour._id, name: tour.name } : null,
			customer: customer
				? {
						_id: customer._id,
						name: customer.name,
						email: customer.email,
						phone: customer.phone,
					}
				: null,
		};
	},
});

// ----- Mutations -----

/**
 * Create a staff booking. Defaults to "pending". The caller picks the
 * existing customer; use customers.ts::create first if they don't yet
 * exist. (The public booking flow in public_booking.ts auto-creates
 * customers.)
 */
export const create = mutation({
	args: {
		tourId: v.id("tours"),
		customerId: v.id("customers"),
		date: v.string(), // YYYY-MM-DD
		startTime: v.string(), // HH:MM
		guests: v.number(),
		guestNames: v.optional(v.string()),
		languageRequired: v.optional(v.string()),
		notes: v.optional(v.string()),
		// SECURITY: only pending/confirmed are valid for a new booking.
		// checked_in/completed/cancelled would bypass the state machine
		// (no checkIn, no customer-stats bump, no schedule capacity math).
		// Source: backend/tours/services/booking_service.py:create —
		// always starts as pending/confirmed, never terminal states.
		status: v.optional(
			v.union(v.literal("pending"), v.literal("confirmed")),
		),
		depositAmountCents: v.optional(v.int64()),
		totalAmountCents: v.optional(v.int64()),
		paymentMethod: v.optional(v.string()),
		source: v.optional(v.string()),
		// Optional link to a concrete tourSchedule. When provided,
		// the schedule's capacityBooked is incremented atomically
		// (throws "Schedule over capacity" if there's no room).
		scheduleId: v.optional(v.id("tourSchedules")),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, [
			"owner",
			"admin",
			"member",
		]);

		const tour = await ctx.db.get(args.tourId);
		if (!tour) throw new ConvexError("Tour not found");
		if (tour.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: tour belongs to a different organization");
		}
		const customer = await ctx.db.get(args.customerId);
		if (!customer) throw new ConvexError("Customer not found");
		if (customer.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: customer belongs to a different organization");
		}
		// Reject past dates and dates inside the bookingCutoffHours
		// window. parseBookingTime returns null on malformed input.
		const tourTs = parseBookingTime(args.date, args.startTime);
		if (tourTs === null) {
			throw new ConvexError(
				`Invalid date or time: "${args.date} ${args.startTime}"`,
			);
		}
		const nowMs = Date.now();
		if (tourTs <= nowMs) {
			throw new ConvexError(
				"Cannot book a tour in the past or starting within the next minute",
			);
		}
		const cutoffMs = tour.bookingCutoffHours ?? 0;
		if (cutoffMs > 0 && tourTs - nowMs < cutoffMs * 3_600_000) {
			throw new ConvexError(
				`Bookings must be made at least ${tour.bookingCutoffHours}h before the tour`,
			);
		}
		if (args.guests <= 0) {
			throw new ConvexError("guests must be > 0");
		}
		if (tour.maxGuests && args.guests > tour.maxGuests) {
			throw new ConvexError(
				`Guest count exceeds tour maximum of ${tour.maxGuests}`,
			);
		}

		// Length validation on free-text fields. The FE caps these via
		// maxLength but the BE is reachable by any Convex client
		// (mobile app, future API, curl) — defending in depth keeps
		// the table clean and prevents overlong inserts.
		if (args.notes !== undefined) {
			assertFieldWithinLimit("notes", args.notes, MAX_NOTES_LEN);
		}
		if (args.guestNames !== undefined) {
			assertFieldWithinLimit(
				"guestNames",
				args.guestNames,
				MAX_GUEST_NAMES_LEN,
			);
		}
		if (args.languageRequired !== undefined) {
			assertFieldWithinLimit(
				"languageRequired",
				args.languageRequired,
				MAX_SHORT_FIELD_LEN,
			);
		}
		if (args.paymentMethod !== undefined) {
			assertFieldWithinLimit(
				"paymentMethod",
				args.paymentMethod,
				MAX_PAYMENT_METHOD_LEN,
			);
		}

		// If a scheduleId was provided, validate it belongs to the
		// same tour + org before we attempt to increment its counter.
		if (args.scheduleId) {
			const schedule = await ctx.db.get(args.scheduleId);
			if (!schedule) throw new ConvexError("Schedule not found");
			if (schedule.organizationId !== member.organizationId) {
				throw new ConvexError(
					"Forbidden: schedule belongs to a different organization",
				);
			}
			if (schedule.tourId !== args.tourId) {
				throw new ConvexError(
					"Schedule does not belong to the specified tour",
				);
			}
		}

		const deposit = args.depositAmountCents ?? 0n;
		const total = args.totalAmountCents ?? 0n;
		const balance = total - deposit;
		const now = Date.now();

		const bookingId = await ctx.db.insert("bookings", {
			organizationId: member.organizationId,
			tourId: args.tourId,
			scheduleId: args.scheduleId,
			customerId: args.customerId,
			date: args.date,
			startTime: args.startTime,
			guests: args.guests,
			guestNames: args.guestNames ?? "",
			languageRequired: args.languageRequired ?? "",
			notes: args.notes ?? "",
			status: args.status ?? "confirmed",
			depositAmountCents: deposit,
			totalAmountCents: total,
			balanceDueCents: balance,
			paymentMethod: args.paymentMethod ?? "",
			checkedInAt: undefined,
			checkedInBy: "",
			completedAt: undefined,
			// Net revenue = gross minus commission. We don't track
			// commission on regular (non-OTA) bookings, so this
			// collapses to total. Source: backend/tours/models.py:972
			// (net_revenue_cents field) — populated only for OTA rows.
			netRevenueCents: total,
			source: args.source ?? "direct",
			reviewRating: undefined,
			reviewComment: "",
			createdAt: now,
			updatedAt: now,
		});

		// Atomically increment the schedule's booked counter. Throws
		// "Schedule over capacity" if there's no room — Convex will
		// roll back the insert above.
		if (args.scheduleId) {
			await ctx.runMutation(
				internal.tourSchedules.incrementBooked as unknown as Parameters<
					typeof ctx.runMutation
				>[0],
				{
					organizationId: member.organizationId,
					scheduleId: args.scheduleId,
					guests: args.guests,
				},
			);
		}

		// Source pattern: unconditionally set customer.nextBookingDate
		// when the booking is in the future. Source doesn't max() —
		// it overwrites. We follow source.
		// See backend/tours/services/booking_service.py:148-151.
		const today = new Date().toISOString().slice(0, 10);
		if (args.date >= today) {
			await ctx.db.patch(args.customerId, {
				nextBookingDate: args.date,
				updatedAt: now,
			});
		}

		await logAudit(ctx, {
			organizationId: member.organizationId,
			userId: member.userId,
			action: "booking.created",
			resourceType: "booking",
			resourceId: bookingId,
			oldValues: {},
			newValues: {
				tourId: args.tourId,
				customerId: args.customerId,
				date: args.date,
				startTime: args.startTime,
				guests: args.guests,
			},
		});

		// Schedule reminder notifications (24h + 2h before tour).
		// Source had this defined but never called — we wire it here.
		// See backend/notifications/service.py::schedule_booking_reminders.
		// Note: status is constrained to pending|confirmed at the args
		// level, so no need to check for "cancelled" here.
		{
			// Send an immediate booking-confirmation email/SMS using
			// the org's active `booking_confirmation` template.
			// Runs after the booking is inserted so the dispatcher
			// can reference bookingId in its audit log.
			// Best-effort: email failure does not fail the booking.
			await ctx.scheduler.runAfter(
				0,
				internal.notification_dispatch.dispatchImmediateBookingConfirmation as unknown as Parameters<
					typeof ctx.scheduler.runAfter
				>[2],
				{ bookingId },
			);
			await ctx.runMutation(
				internal.scheduledNotifications.scheduleForBooking,
				{
					organizationId: member.organizationId,
					bookingId,
					date: args.date,
					startTime: args.startTime,
				},
			);
		}

		return bookingId;
	},
});

/** Update a booking. Refuses terminal states. */
export const update = mutation({
	args: {
		bookingId: v.id("bookings"),
		date: v.optional(v.string()),
		startTime: v.optional(v.string()),
		guests: v.optional(v.number()),
		guestNames: v.optional(v.string()),
		languageRequired: v.optional(v.string()),
		notes: v.optional(v.string()),
		// SECURITY: `status` is intentionally NOT in the args. State
		// transitions must go through checkIn / complete / cancel so
		// the side effects (audit log, customer stats, schedule
		// capacity) are consistent. Adding status here would let
		// callers bypass the state machine.
		depositAmountCents: v.optional(v.int64()),
		totalAmountCents: v.optional(v.int64()),
		paymentMethod: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, [
			"owner",
			"admin",
			"member",
		]);
		const booking = await ctx.db.get(args.bookingId);
		if (!booking) throw new ConvexError("Booking not found");
		if (booking.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		// Source: backend/tours/services/booking_service.py:206-207.
		// Modify refuses: completed | cancelled | no_show. We carry
		// `completed` + `cancelled` (no `no_show` in our schema union).
		if (booking.status === "cancelled" || booking.status === "completed") {
			throw new ConvexError(
				`Cannot modify a ${booking.status} booking`,
			);
		}

		// Length validation on free-text fields (defense in depth).
		if (args.notes !== undefined) {
			assertFieldWithinLimit("notes", args.notes, MAX_NOTES_LEN);
		}
		if (args.guestNames !== undefined) {
			assertFieldWithinLimit("guestNames", args.guestNames, MAX_GUEST_NAMES_LEN);
		}
		if (args.languageRequired !== undefined) {
			assertFieldWithinLimit("languageRequired", args.languageRequired, MAX_SHORT_FIELD_LEN);
		}
		if (args.paymentMethod !== undefined) {
			assertFieldWithinLimit("paymentMethod", args.paymentMethod, MAX_PAYMENT_METHOD_LEN);
		}

		const now = Date.now();
		const patch: Record<string, unknown> = {};
		const changes: Record<string, { old: unknown; new: unknown }> = {};

		for (const field of ALLOWED_UPDATE_FIELDS) {
			const incoming = (args as Record<string, unknown>)[field];
			if (incoming === undefined) continue;
			const oldValue = (booking as Record<string, unknown>)[field];
			if (oldValue !== incoming) {
				changes[field] = { old: oldValue, new: incoming };
			}
			patch[field] = incoming;
		}

		// Length validation on free-text fields (same caps as create).
		if (args.notes !== undefined) {
			assertFieldWithinLimit("notes", args.notes, MAX_NOTES_LEN);
		}
		if (args.guestNames !== undefined) {
			assertFieldWithinLimit(
				"guestNames",
				args.guestNames,
				MAX_GUEST_NAMES_LEN,
			);
		}
		if (args.languageRequired !== undefined) {
			assertFieldWithinLimit(
				"languageRequired",
				args.languageRequired,
				MAX_SHORT_FIELD_LEN,
			);
		}

		// Source: balance_due = total_amount - deposit_amount on total update.
		if (patch.totalAmountCents !== undefined) {
			const newTotal = patch.totalAmountCents as bigint;
			const dep =
				(patch.depositAmountCents as bigint | undefined) ??
				booking.depositAmountCents;
			patch.balanceDueCents = newTotal - dep;
			// Net revenue = total (no commission on regular bookings).
			patch.netRevenueCents = newTotal;
		} else if (patch.depositAmountCents !== undefined) {
			const dep = patch.depositAmountCents as bigint;
			patch.balanceDueCents = booking.totalAmountCents - dep;
			patch.netRevenueCents = booking.totalAmountCents;
		}

		patch.updatedAt = now;
		await ctx.db.patch(args.bookingId, patch);

		await logAudit(ctx, {
			organizationId: booking.organizationId,
			userId: member.userId,
			action: "booking.updated",
			resourceType: "booking",
			resourceId: args.bookingId,
			oldValues: {},
			newValues: { changes },
		});

		return args.bookingId;
	},
});

/** Internal mirror of update — no auth, used by tests + the
 *  edit-booking page's flow. Same logic as the public update. */
export const internalUpdate = internalMutation({
	args: {
		bookingId: v.id("bookings"),
		date: v.optional(v.string()),
		startTime: v.optional(v.string()),
		guests: v.optional(v.number()),
		guestNames: v.optional(v.string()),
		languageRequired: v.optional(v.string()),
		notes: v.optional(v.string()),
		depositAmountCents: v.optional(v.int64()),
		totalAmountCents: v.optional(v.int64()),
		paymentMethod: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const booking = await ctx.db.get(args.bookingId);
		if (!booking) throw new ConvexError("Booking not found");
		if (booking.status === "cancelled" || booking.status === "completed") {
			throw new ConvexError(
				`Cannot modify a ${booking.status} booking`,
			);
		}

		const now = Date.now();
		const patch: Record<string, unknown> = {};
		const changes: Record<string, { old: unknown; new: unknown }> = {};

		for (const field of ALLOWED_UPDATE_FIELDS) {
			const incoming = (args as Record<string, unknown>)[field];
			if (incoming === undefined) continue;
			const oldValue = (booking as Record<string, unknown>)[field];
			if (oldValue !== incoming) {
				changes[field] = { old: oldValue, new: incoming };
			}
			patch[field] = incoming;
		}

		// Same length caps as the public update.
		if (args.notes !== undefined) {
			assertFieldWithinLimit("notes", args.notes, MAX_NOTES_LEN);
		}
		if (args.guestNames !== undefined) {
			assertFieldWithinLimit(
				"guestNames",
				args.guestNames,
				MAX_GUEST_NAMES_LEN,
			);
		}
		if (args.languageRequired !== undefined) {
			assertFieldWithinLimit(
				"languageRequired",
				args.languageRequired,
				MAX_SHORT_FIELD_LEN,
			);
		}
		if (args.paymentMethod !== undefined) {
			assertFieldWithinLimit(
				"paymentMethod",
				args.paymentMethod,
				MAX_PAYMENT_METHOD_LEN,
			);
		}

		if (patch.totalAmountCents !== undefined) {
			const newTotal = patch.totalAmountCents as bigint;
			const dep =
				(patch.depositAmountCents as bigint | undefined) ??
				booking.depositAmountCents;
			patch.balanceDueCents = newTotal - dep;
			patch.netRevenueCents = newTotal;
		} else if (patch.depositAmountCents !== undefined) {
			const dep = patch.depositAmountCents as bigint;
			patch.balanceDueCents = booking.totalAmountCents - dep;
			patch.netRevenueCents = booking.totalAmountCents;
		}

		patch.updatedAt = now;
		await ctx.db.patch(args.bookingId, patch);

		await logAudit(ctx, {
			organizationId: booking.organizationId,
			userId: "system",
			action: "booking.updated",
			resourceType: "booking",
			resourceId: args.bookingId,
			oldValues: {},
			newValues: { changes },
		});

		return args.bookingId;
	},
});

/** Cancel a booking. Terminal — cannot be undone. */
export const cancel = mutation({
	args: {
		bookingId: v.id("bookings"),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		const booking = await ctx.db.get(args.bookingId);
		if (!booking) throw new ConvexError("Booking not found");
		if (booking.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await performCancel(ctx, booking, args.reason, member.userId);
		return args.bookingId;
	},
});

/** Internal mirror of cancel — no auth, used by tests + scheduled
 *  job that auto-cancels stale pending bookings (future work). */
export const internalCancel = internalMutation({
	args: {
		bookingId: v.id("bookings"),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const booking = await ctx.db.get(args.bookingId);
		if (!booking) throw new ConvexError("Booking not found");
		await performCancel(ctx, booking, args.reason, "system");
		return args.bookingId;
	},
});

async function performCancel(
	ctx: MutationCtx,
	booking: {
		_id: Id<"bookings">;
		organizationId: string;
		customerId: Id<"customers">;
		tourId: Id<"tours">;
		scheduleId?: Id<"tourSchedules">;
		status: "pending" | "confirmed" | "checked_in" | "completed" | "cancelled";
		notes: string;
		date: string;
		startTime: string;
		guests: number;
	},
	reason: string | undefined,
	userIdForAudit: string,
): Promise<void> {
	// Source: backend/tours/services/booking_service.py:206-207.
	// Terminal states cannot be cancelled.
	if (booking.status === "cancelled") {
		throw new ConvexError("Already cancelled");
	}
	if (booking.status === "completed") {
		throw new ConvexError("Cannot cancel a completed booking");
	}
	if (booking.status === "checked_in") {
		throw new ConvexError(
			"Cannot cancel a checked-in booking; complete it first",
		);
	}

	const now = Date.now();
	await ctx.db.patch(booking._id, {
		status: "cancelled",
		notes: reason
			? booking.notes
				? `${booking.notes}\n[CANCELLED] ${reason}`
				: `[CANCELLED] ${reason}`
			: booking.notes,
		updatedAt: now,
	});

	// Restore the matching tourSchedule's capacityBooked counter.
	// Prefer the explicit scheduleId on the booking; fall back to
	// a (tourId, date, startTime) lookup for older bookings that
	// predate the scheduleId field.
	let scheduleId: Id<"tourSchedules"> | undefined = booking.scheduleId;
	if (!scheduleId) {
		const schedule = await ctx.db
			.query("tourSchedules")
			.withIndex("by_tour_date", (q) =>
				q.eq("tourId", booking.tourId).eq("date", booking.date),
			)
			.filter((q) =>
				q.and(
					q.eq(q.field("organizationId"), booking.organizationId),
					q.eq(q.field("startTime"), booking.startTime),
				),
			)
			.first();
		scheduleId = schedule?._id;
	}
	if (scheduleId) {
		try {
			await ctx.runMutation(
				internal.tourSchedules.decrementBooked as unknown as Parameters<
					typeof ctx.runMutation
				>[0],
				{
					organizationId: booking.organizationId,
					scheduleId,
					guests: booking.guests,
				},
			);
		} catch {
			// Capacity restore is best-effort; the cancellation
			// is the source of truth and the schedule can be
			// reconciled manually if needed.
		}
	}

	// Clear the customer's nextBookingDate if it pointed at this
	// booking's date. Without this, a cancelled booking still
	// appears in the "next booking" sort.
	const customer = await ctx.db.get(booking.customerId);
	if (customer?.nextBookingDate === booking.date) {
		await ctx.db.patch(booking.customerId, {
			nextBookingDate: undefined,
			updatedAt: now,
		});
	}

	// Cancel any pending scheduledNotifications for this booking so
	// the cron doesn't fire 24h/2h reminders about a booking that
	// no longer exists. Mark sent=true (preserves the audit row) +
	// record a skip reason.
	const pending = await ctx.db
		.query("scheduledNotifications")
		.withIndex("by_booking_sent", (q) =>
			q.eq("bookingId", booking._id).eq("sent", false),
		)
		.collect();
	for (const s of pending) {
		await ctx.db.patch(s._id, {
			sent: true,
			processedAt: now,
			notificationLogId: undefined,
		});
	}

	await logAudit(ctx, {
		organizationId: booking.organizationId,
		userId: userIdForAudit,
		action: "booking.cancelled",
		resourceType: "booking",
		resourceId: booking._id,
		oldValues: { status: booking.status },
		newValues: { status: "cancelled", reason: reason ?? "" },
	});
}

/** Mark a confirmed booking as checked in. */
export const checkIn = mutation({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, [
			"owner",
			"admin",
			"member",
		]);
		const booking = await ctx.db.get(args.bookingId);
		if (!booking) throw new ConvexError("Booking not found");
		if (booking.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		if (booking.status !== "confirmed") {
			throw new ConvexError(
				`Only confirmed bookings can be checked in (was ${booking.status})`,
			);
		}

		const now = Date.now();
		await ctx.db.patch(args.bookingId, {
			status: "checked_in",
			checkedInAt: now,
			checkedInBy: member.userId,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: booking.organizationId,
			userId: member.userId,
			action: "booking.checked_in",
			resourceType: "booking",
			resourceId: args.bookingId,
			oldValues: { status: "confirmed" },
			newValues: {
				status: "checked_in",
				checkedInAt: now,
				checkedInBy: member.userId,
			},
		});
		return args.bookingId;
	},
});

/** Complete a checked-in booking. Bumps customer loyalty / total revenue. */
export const complete = mutation({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, [
			"owner",
			"admin",
			"member",
		]);
		const booking = await ctx.db.get(args.bookingId);
		if (!booking) throw new ConvexError("Booking not found");
		if (booking.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await performComplete(ctx, booking, member.userId);
		return args.bookingId;
	},
});

/** Internal mirror — no auth, used by tests. Same logic as
 *  the public complete. */
export const internalComplete = internalMutation({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, args) => {
		const booking = await ctx.db.get(args.bookingId);
		if (!booking) throw new ConvexError("Booking not found");
		await performComplete(ctx, booking, "system");
		return args.bookingId;
	},
});

async function performComplete(
	ctx: MutationCtx,
	booking: {
		_id: Id<"bookings">;
		organizationId: string;
		customerId: Id<"customers">;
		status: "pending" | "confirmed" | "checked_in" | "completed" | "cancelled";
		checkedInAt?: number;
		totalAmountCents: bigint;
	},
	userIdForAudit: string,
): Promise<void> {
	// Idempotency: a booking already past "checked_in" must not
	// re-bump customer stats. Source model has no formal state
	// machine — but with multiple completions, a single visit
	// would inflate totalVisits / loyaltyPoints / totalRevenue
	// each time.
	if (booking.status === "completed") {
		throw new ConvexError("Booking is already completed");
	}
	// Terminal state guard: cancelled bookings must never be
	// completed. performCancel doesn't clear checkedInAt, so a
	// checked-in booking can be cancelled and then erroneously
	// completed via this path. Refuse explicitly.
	if (booking.status === "cancelled") {
		throw new ConvexError("Cannot complete a cancelled booking");
	}
	if (!booking.checkedInAt) {
		throw new ConvexError("Only checked-in bookings can be completed");
	}

	const now = Date.now();
	await ctx.db.patch(booking._id, {
		status: "completed",
		completedAt: now,
		updatedAt: now,
	});

	// Mirror source's customer-stats bump.
	const customer = await ctx.db.get(booking.customerId);
	if (customer) {
		const newVisits = customer.totalVisits + 1;
		const newRevenue =
			customer.totalRevenueCents + booking.totalAmountCents;
		const newLoyalty =
			customer.loyaltyPoints + LOYALTY_POINTS_PER_BOOKING;
		const shouldBeVip =
			customer.vipStatus ||
			(VIP_THRESHOLD_VISITS > 0 &&
				newVisits >= VIP_THRESHOLD_VISITS);
		await ctx.db.patch(booking.customerId, {
			totalVisits: newVisits,
			totalRevenueCents: newRevenue,
			loyaltyPoints: newLoyalty,
			vipStatus: shouldBeVip,
			updatedAt: now,
		});
	}

	await logAudit(ctx, {
		organizationId: booking.organizationId,
		userId: userIdForAudit,
		action: "booking.completed",
		resourceType: "booking",
		resourceId: booking._id,
		oldValues: { status: "checked_in" },
		newValues: { status: "completed", completedAt: now },
	});
}

/** Record a post-tour review on a completed booking. */
export const recordReview = mutation({
	args: {
		bookingId: v.id("bookings"),
		rating: v.number(), // 1..5
		comment: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, [
			"owner",
			"admin",
			"member",
		]);
		const booking = await ctx.db.get(args.bookingId);
		if (!booking) throw new ConvexError("Booking not found");
		if (booking.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		// SECURITY: only completed bookings can have reviews recorded.
		// Cancelled / future / no-show bookings should never get a
		// rating (would distort analytics + let staff pad their
		// tours' reviews).
		if (booking.status !== "completed") {
			throw new ConvexError(
				"Reviews can only be recorded for completed bookings",
			);
		}
		if (args.rating < 1 || args.rating > 5) {
			throw new ConvexError("Rating must be 1..5");
		}
		// Reviews can run long (a customer might write a paragraph)
		// but we still cap to keep the table bounded. MAX_NOTES_LEN
		// (1000) is the same cap we use elsewhere for free text.
		if (args.comment !== undefined) {
			assertFieldWithinLimit("comment", args.comment, MAX_NOTES_LEN);
		}

		const now = Date.now();
		await ctx.db.patch(args.bookingId, {
			reviewRating: args.rating,
			reviewComment: args.comment ?? "",
			updatedAt: now,
		});
		return args.bookingId;
	},
});

/** Internal mirror of recordReview — no auth, used by tests. */
export const internalRecordReview = internalMutation({
	args: {
		bookingId: v.id("bookings"),
		rating: v.number(),
		comment: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const booking = await ctx.db.get(args.bookingId);
		if (!booking) throw new ConvexError("Booking not found");
		if (booking.status !== "completed") {
			throw new ConvexError(
				"Reviews can only be recorded for completed bookings",
			);
		}
		if (args.rating < 1 || args.rating > 5) {
			throw new ConvexError("Rating must be 1..5");
		}
		if (args.comment !== undefined) {
			assertFieldWithinLimit("comment", args.comment, MAX_NOTES_LEN);
		}

		await ctx.db.patch(args.bookingId, {
			reviewRating: args.rating,
			reviewComment: args.comment ?? "",
			updatedAt: Date.now(),
		});
		return args.bookingId;
	},
});