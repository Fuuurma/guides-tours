// Booking lifecycle logic, extracted from convex/bookings.ts
// (god-module decomposition, slice 1).
//
// This module owns the shared mutation core — the `perform*`
// functions called by both the public mutations (after authz) and
// their internal mirrors (tests + cron). Auth lives at the handler
// layer; these functions assume the caller already checked it.
//
// Bodies are moved verbatim; see bookings.ts for the handler docs.

import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { parseBookingTime } from "./time";
import { logAudit } from "./audit";
import {
	MAX_GUEST_NAMES_LEN,
	MAX_NOTES_LEN,
	MAX_PAYMENT_METHOD_LEN,
	MAX_SHORT_FIELD_LEN,
	assertFieldWithinLimit,
} from "./validation";
import { isBlackoutHelper } from "../tourBlackoutDates";

// Whitelisted update fields — mirrors source's ALLOWED_BOOKING_UPDATE_FIELDS
// minus currency/conversion noise (we are cents-only).
export const ALLOWED_UPDATE_FIELDS = new Set([
	"date",
	"startTime",
	"guests",
	"guestNames",
	"languageRequired",
	"notes",
	"depositAmountCents",
	"totalAmountCents",
	"paymentMethod",
	"scheduleId",
]);

export async function findTargetSchedule(
	ctx: MutationCtx,
	args: {
		organizationId: string;
		tourId: Id<"tours">;
		date: string;
		startTime: string;
		scheduleId?: Id<"tourSchedules">;
	},
) {
	if (args.scheduleId) {
		const schedule = await ctx.db.get(args.scheduleId);
		if (!schedule) throw new ConvexError("Schedule not found");
		if (schedule.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: schedule belongs to a different organization");
		}
		if (schedule.tourId !== args.tourId) {
			throw new ConvexError("Schedule does not belong to the booking's tour");
		}
		if (schedule.status === "cancelled") {
			throw new ConvexError("Cannot move a booking to a cancelled schedule");
		}
		return schedule;
	}

	const match = await ctx.db
		.query("tourSchedules")
		.withIndex("by_tour_date_start", (q) =>
			q
				.eq("tourId", args.tourId)
				.eq("date", args.date)
				.eq("startTime", args.startTime),
		)
		.unique();
	if (match && match.organizationId !== args.organizationId) return null;
	if (match?.status === "cancelled") {
		throw new ConvexError("Cannot move a booking to a cancelled schedule");
	}
	return match ?? null;
}

export async function clearPendingBookingReminders(
	ctx: MutationCtx,
	bookingId: Id<"bookings">,
) {
	// A booking should have at most a handful of pending reminders
	// (24h + 2h + booking_confirmation). Cap at 20 as a safety net
	// against pathological data — well above any legitimate count.
	const MAX_REMINDERS = 20;
	const pending = await ctx.db
		.query("scheduledNotifications")
		.withIndex("by_booking_sent", (q) =>
			q.eq("bookingId", bookingId).eq("sent", false),
		)
		.take(MAX_REMINDERS);
	for (const notification of pending) {
		await ctx.db.patch(notification._id, {
			sent: true,
			processedAt: Date.now(),
			notificationLogId: undefined,
		});
	}
}

// Source: BusinessConstants.LOYALTY_POINTS_PER_BOOKING
const LOYALTY_POINTS_PER_BOOKING = 10;
// Source: BusinessConstants.VIP_THRESHOLD_VISITS
const VIP_THRESHOLD_VISITS = 5;
/**
 * Shared update logic for the public `update` and internal
 * `internalUpdate` mutations. Caller is responsible for authz
 * (the public mutation checks org membership; the internal mirror
 * is called from already-authed contexts like tests + cron).
 *
 * Extracted to eliminate ~250 lines of duplicated logic — a bug
 * fix in one copy previously missed the other. Mirrors the
 * `performConfirm` / `performCancel` / `performComplete` pattern
 * already used by the other lifecycle mutations.
 */
export async function performUpdate(
	ctx: MutationCtx,
	booking: Doc<"bookings">,
	organizationId: string,
	userIdForAudit: string,
	args: {
		bookingId: Id<"bookings">;
		date?: string;
		startTime?: string;
		guests?: number;
		guestNames?: string;
		languageRequired?: string;
		notes?: string;
		depositAmountCents?: bigint;
		totalAmountCents?: bigint;
		paymentMethod?: string;
		scheduleId?: Id<"tourSchedules">;
	},
): Promise<Id<"bookings">> {
	// Source: backend/tours/services/booking_service.py:206-207.
	// Modify refuses: completed | cancelled | no_show. We carry
	// `completed` + `cancelled` (no `no_show` in our schema union).
	if (booking.status === "cancelled" || booking.status === "completed") {
		throw new ConvexError(
			`Cannot modify a ${booking.status} booking`,
		);
	}
	const rescheduleRequested =
		args.date !== undefined ||
		args.startTime !== undefined ||
		args.scheduleId !== undefined;
	if (booking.status === "checked_in" && rescheduleRequested) {
		throw new ConvexError("Cannot reschedule a checked-in booking");
	}

	const tour = rescheduleRequested ? await ctx.db.get(booking.tourId) : null;
	if (rescheduleRequested && !tour) {
		throw new ConvexError("Tour not found");
	}
	const targetDate = rescheduleRequested
		? args.date ?? booking.date
		: booking.date;
	const targetStartTime = rescheduleRequested
		? args.startTime ?? booking.startTime
		: booking.startTime;
	const targetSchedule = rescheduleRequested
		? await findTargetSchedule(ctx, {
				organizationId,
				tourId: booking.tourId,
				date: targetDate,
				startTime: targetStartTime,
				scheduleId: args.scheduleId,
			})
		: booking.scheduleId
			? await ctx.db.get(booking.scheduleId)
			: null;
	const nextDate = targetSchedule?.date ?? targetDate;
	const nextStartTime = targetSchedule?.startTime ?? targetStartTime;
	const nextGuests = args.guests ?? booking.guests;

	if (rescheduleRequested) {
		const tourTs = parseBookingTime(nextDate, nextStartTime);
		if (tourTs === null || tourTs <= Date.now()) {
			throw new ConvexError("Cannot move a booking into the past");
		}
		const cutoffHours = tour?.bookingCutoffHours ?? 0;
		if (cutoffHours > 0 && tourTs - Date.now() < cutoffHours * 3_600_000) {
			throw new ConvexError(
				`Bookings must be made at least ${cutoffHours}h before the tour`,
			);
		}
		if (await isBlackoutHelper(ctx, booking.tourId, nextDate)) {
			throw new ConvexError(
				"This date is not available for booking. Please pick another date.",
			);
		}
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
	if (rescheduleRequested) {
		patch.date = nextDate;
		patch.startTime = nextStartTime;
		patch.scheduleId = targetSchedule?._id;
		patch.guests = nextGuests;
		for (const [field, nextValue] of [
			["date", nextDate],
			["startTime", nextStartTime],
			["scheduleId", targetSchedule?._id],
			["guests", nextGuests],
		] as const) {
			const oldValue = (booking as Record<string, unknown>)[field];
			if (oldValue !== nextValue) {
				changes[field] = { old: oldValue, new: nextValue };
			}
		}
	}

	const oldScheduleId = booking.scheduleId;
	const nextScheduleId = targetSchedule?._id;
	if (oldScheduleId === nextScheduleId) {
		const delta = nextGuests - booking.guests;
		if (delta > 0 && nextScheduleId) {
			await ctx.runMutation(
				internal.tourSchedules.incrementBooked,
				{
					organizationId,
					scheduleId: nextScheduleId,
					guests: delta,
				},
			);
		} else if (delta < 0 && nextScheduleId) {
			await ctx.runMutation(
				internal.tourSchedules.decrementBooked,
				{
					organizationId,
					scheduleId: nextScheduleId,
					guests: Math.abs(delta),
				},
			);
		}
	} else {
		if (oldScheduleId) {
			await ctx.runMutation(
				internal.tourSchedules.decrementBooked,
				{
					organizationId,
					scheduleId: oldScheduleId,
					guests: booking.guests,
				},
			);
		}
		if (nextScheduleId) {
			await ctx.runMutation(
				internal.tourSchedules.incrementBooked,
				{
					organizationId,
					scheduleId: nextScheduleId,
					guests: nextGuests,
				},
			);
		}
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

	const slotChanged =
		changes.date !== undefined ||
		changes.startTime !== undefined ||
		changes.scheduleId !== undefined ||
		changes.guests !== undefined;
	if (slotChanged) {
		await clearPendingBookingReminders(ctx, args.bookingId);
		if (booking.status === "confirmed") {
			await ctx.scheduler.runAfter(
				0,
				internal.notification_dispatch.dispatchImmediateBookingConfirmation,
				{ bookingId: args.bookingId },
			);
			await ctx.runMutation(internal.scheduledNotifications.scheduleForBooking, {
				organizationId,
				bookingId: args.bookingId,
				date: nextDate,
				startTime: nextStartTime,
			});
		}
	}

	await logAudit(ctx, {
		organizationId: booking.organizationId,
		userId: userIdForAudit,
		action: "booking.updated",
		resourceType: "booking",
		resourceId: args.bookingId,
		// Flatten changes into oldValues/newValues so the audit row
		// records what actually changed (previously oldValues was {}).
		oldValues: Object.fromEntries(
			Object.entries(changes).map(([k, v]) => [k, v.old]),
		),
		newValues: Object.fromEntries(
			Object.entries(changes).map(([k, v]) => [k, v.new]),
		),
	});

	return args.bookingId;
}

export async function performConfirm(
	ctx: MutationCtx,
	booking: {
		_id: Id<"bookings">;
		organizationId: string;
		date: string;
		startTime: string;
		status: "pending" | "confirmed" | "checked_in" | "completed" | "cancelled";
	},
	userId: string,
) {
	const now = Date.now();
	await ctx.db.patch(booking._id, { status: "confirmed", updatedAt: now });
	await logAudit(ctx, {
		organizationId: booking.organizationId,
		userId,
		action: "booking.confirmed",
		resourceType: "booking",
		resourceId: booking._id,
		oldValues: { status: "pending" },
		newValues: { status: "confirmed" },
	});
	await ctx.scheduler.runAfter(
		0,
		internal.notification_dispatch.dispatchImmediateBookingConfirmation,
		{ bookingId: booking._id },
	);
	await ctx.runMutation(internal.scheduledNotifications.scheduleForBooking, {
		organizationId: booking.organizationId,
		bookingId: booking._id,
		date: booking.date,
		startTime: booking.startTime,
	});
}
export async function performCancel(
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
	// Cap the cancel reason at the same limit as notes so an
	// attacker can't bloat the row via the internal* mirror.
	const MAX_CANCEL_REASON_LEN = 500;
	if (reason !== undefined && reason.length > MAX_CANCEL_REASON_LEN) {
		throw new ConvexError(
			`Cancel reason is too long (max ${MAX_CANCEL_REASON_LEN} characters)`,
		);
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
				internal.tourSchedules.decrementBooked,
				{
					organizationId: booking.organizationId,
					scheduleId,
					guests: booking.guests,
				},
			);
		} catch (err) {
			// Capacity restore is best-effort; the cancellation
			// is the source of truth and the schedule can be
			// reconciled manually if needed. But silent swallow
			// hides permanent capacity loss from operators
			// (fleet needs-work 2026-09-08 P1) — log it.
			console.error("[bookingsLifecycle] decrementBooked failed", {
				scheduleId,
				bookingId: booking._id,
				guests: booking.guests,
				error: err instanceof Error ? err.message : String(err),
			});
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
	// record a skip reason. Cap at 20 — same rationale as
	// clearPendingBookingReminders.
	const MAX_CANCEL_REMINDERS = 20;
	const pending = await ctx.db
		.query("scheduledNotifications")
		.withIndex("by_booking_sent", (q) =>
			q.eq("bookingId", booking._id).eq("sent", false),
		)
		.take(MAX_CANCEL_REMINDERS);
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
export async function performComplete(
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
