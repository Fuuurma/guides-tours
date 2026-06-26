// Bookings CRUD + lifecycle mutations.
//
// Source: reservations-automation
//   backend/tours/services/booking_service.py
//   backend/tours/routers/staff/bookings.py
//
// Phase 7.1 scope: staff-side booking lifecycle. PublicBooking flow
// (anonymous customer-facing) lands in Phase 7.2.
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
import { mutation, query } from "./_generated/server";
import { requireMembership, requireRole } from "./lib/authz";
import { internal } from "./_generated/api";

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

		const all = await ctx.db
			.query("bookings")
			.withIndex("by_org_date", (q) =>
				q.eq("organizationId", member.organizationId),
			)
			.collect();

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
 * exist. (Phase 7.2 will add public booking flow which auto-creates
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
		status: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("confirmed"),
				v.literal("checked_in"),
				v.literal("completed"),
				v.literal("cancelled"),
			),
		),
		depositAmountCents: v.optional(v.int64()),
		totalAmountCents: v.optional(v.int64()),
		paymentMethod: v.optional(v.string()),
		source: v.optional(v.string()),
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
		if (args.guests <= 0) {
			throw new ConvexError("guests must be > 0");
		}
		if (tour.maxGuests && args.guests > tour.maxGuests) {
			throw new ConvexError(
				`Guest count exceeds tour maximum of ${tour.maxGuests}`,
			);
		}

		const deposit = args.depositAmountCents ?? 0n;
		const total = args.totalAmountCents ?? 0n;
		const balance = total - deposit;
		const now = Date.now();

		const bookingId = await ctx.db.insert("bookings", {
			organizationId: member.organizationId,
			tourId: args.tourId,
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

		await ctx.db.insert("auditLogs", {
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
				status: args.status ?? "pending",
			},
			timestamp: now,
		});

		// Schedule reminder notifications (24h + 2h before tour).
		// Source had this defined but never called — we wire it here.
		// See backend/notifications/service.py::schedule_booking_reminders.
		if (args.status !== "cancelled") {
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

		await ctx.db.insert("auditLogs", {
			organizationId: booking.organizationId,
			userId: member.userId,
			action: "booking.updated",
			resourceType: "booking",
			resourceId: args.bookingId,
			oldValues: {},
			newValues: { changes },
			timestamp: now,
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
		await ctx.db.patch(args.bookingId, {
			status: "cancelled",
			notes: args.reason
				? booking.notes
					? `${booking.notes}\n[CANCELLED] ${args.reason}`
					: `[CANCELLED] ${args.reason}`
				: booking.notes,
			updatedAt: now,
		});

		await ctx.db.insert("auditLogs", {
			organizationId: booking.organizationId,
			userId: member.userId,
			action: "booking.cancelled",
			resourceType: "booking",
			resourceId: args.bookingId,
			oldValues: { status: booking.status },
			newValues: { status: "cancelled", reason: args.reason ?? "" },
			timestamp: now,
		});

		return args.bookingId;
	},
});

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
		await ctx.db.insert("auditLogs", {
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
			timestamp: now,
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
		if (!booking.checkedInAt) {
			throw new ConvexError(
				"Only checked-in bookings can be completed",
			);
		}

		const now = Date.now();
		await ctx.db.patch(args.bookingId, {
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

		await ctx.db.insert("auditLogs", {
			organizationId: booking.organizationId,
			userId: member.userId,
			action: "booking.completed",
			resourceType: "booking",
			resourceId: args.bookingId,
			oldValues: { status: "checked_in" },
			newValues: { status: "completed", completedAt: now },
			timestamp: now,
		});

		return args.bookingId;
	},
});

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

		const now = Date.now();
		await ctx.db.patch(args.bookingId, {
			reviewRating: args.rating,
			reviewComment: args.comment ?? "",
			updatedAt: now,
		});
		return args.bookingId;
	},
});