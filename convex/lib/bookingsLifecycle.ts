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
import { logger } from "./logger";
import { logAudit } from "./audit";
import {
	MAX_GUEST_NAMES_LEN,
	MAX_NOTES_LEN,
	MAX_PAYMENT_METHOD_LEN,
	MAX_SHORT_FIELD_LEN,
	assertFieldWithinLimit,
} from "./validation";
import { isBlackoutHelper } from "../tourBlackoutDates";
import { exceptionForDateHelper } from "../tourExceptionDates";

// Booking lifecycle states (mirrors the schema union).
// pending → confirmed | cancelled | expired
// confirmed → checked_in | cancelled | no_show
// checked_in → completed | cancelled
// Terminal: completed | cancelled | expired | no_show.
type BookingStatus = Doc<"bookings">["status"];

// Pending bookings hold capacity from create time; if they are not
// confirmed within this window the cron expires them and releases
// the seats. Source pattern: 15-minute holds (system-design-primer).
export const PENDING_EXPIRY_MS = 15 * 60 * 1000;

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

async function clearPendingBookingReminders(
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
	// Modify refuses terminal states: completed | cancelled |
	// expired | no_show.
	if (
		booking.status === "cancelled" ||
		booking.status === "completed" ||
		booking.status === "expired" ||
		booking.status === "no_show"
	) {
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

	// The tour is needed for the reschedule cutoff and for the
	// guest-count ceiling (create parity) on any guest change.
	const needsTour = rescheduleRequested || args.guests !== undefined;
	const tour = needsTour ? await ctx.db.get(booking.tourId) : null;
	if (needsTour && !tour) {
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

	// Guest-count invariants (create parity): validated before any
	// counter moves so a bad count can never strand a decrement.
	if (args.guests !== undefined) {
		if (!Number.isInteger(nextGuests) || nextGuests <= 0) {
			throw new ConvexError("guests must be a positive integer");
		}
		if (tour?.maxGuests && nextGuests > tour.maxGuests) {
			throw new ConvexError(
				`Guest count exceeds tour maximum of ${tour.maxGuests}`,
			);
		}
	}

	// Live-slot parity (public F344): exceptions bind updates as well
	// as creates. Looked up once — the reschedule checks below and
	// the capacityOverride precheck share it.
	const slotDate = targetSchedule?.date ?? (rescheduleRequested ? targetDate : null);
	const slotException = slotDate
		? await exceptionForDateHelper(ctx, booking.tourId, organizationId, slotDate)
		: null;
	const slotExceptionType = slotException?.exceptionType;
	const slotExceptionStart = slotException?.startTime;

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
		if (slotExceptionType === "removed") {
			throw new ConvexError(
				"This date is not available for booking. Please pick another date.",
			);
		}
		if (
			(slotExceptionType === "modified" || slotExceptionType === "added") &&
			slotExceptionStart !== undefined &&
			nextStartTime !== slotExceptionStart
		) {
			throw new ConvexError(
				"This time slot is not available for booking. Please pick another time.",
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
	// F-new-unlinked-booking-capacity-release follow-up: the capacity
	// claim follows the seats. `undefined` means "this booking holds no
	// seats on any schedule" and must be written as an explicit clear,
	// so it is seeded to the booking's current claim and only reassigned
	// by a counter branch that actually moved seats.
	let nextClaim: Id<"tourSchedules"> | undefined =
		booking.capacityClaimedScheduleId;

	// Atomic capacity precheck: validate the target BEFORE any counter
	// moves, so a failed move cannot strand the old schedule
	// decremented (previously the increment guard threw after the
	// decrement had already mutated). Self seats are excluded — the
	// booking's current seats on the target are its own to reuse — and
	// a capacityOverride caps below capacityTotal (public F344 parity).
	// Only enforced when the update adds load, so lowering an override
	// below current bookings never blocks note-only edits. A cancelled
	// target is rejected here rather than mid-move: incrementBooked
	// already refuses it, so this only converts a partial failure into
	// a clean one.
	const addsLoad =
		nextGuests > booking.guests || nextScheduleId !== oldScheduleId;
	if (targetSchedule && addsLoad) {
		if (targetSchedule.status === "cancelled") {
			throw new ConvexError("Cannot book cancelled schedule");
		}
		const selfSeats =
			targetSchedule._id === oldScheduleId ? booking.guests : 0;
		const projected = targetSchedule.capacityBooked - selfSeats + nextGuests;
		if (projected > targetSchedule.capacityTotal) {
			throw new ConvexError("Schedule over capacity");
		}
		const override = slotException?.capacityOverride;
		if (override !== undefined && projected > override) {
			throw new ConvexError("Not enough seats left for this tour slot");
		}
	}

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
			// This booking now holds seats here, so a claim is true from
			// this point on. Written only where the code actually
			// incremented — a legacy row that never claimed stays
			// unclaimed, which is the safe direction (release becomes a
			// no-op rather than draining someone else's counter).
			nextClaim = nextScheduleId;
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
			// The claim follows the seats across the move.
			nextClaim = nextScheduleId;
		} else {
			// Moved onto a free-time request: this booking now holds no
			// seats on any schedule, so it must claim nothing. Clearing
			// (not leaving the old id) is what stops a later
			// cancel/expiry from releasing the schedule it just left a
			// second time.
			nextClaim = undefined;
		}
	}

	// Money-field validation (F138): create applies the same checks on
	// insert (bookings.ts); an unguarded update could write a negative
	// total/deposit or deposit > total, corrupting balanceDueCents and
	// silently blocking every later charge.
	if (
		patch.totalAmountCents !== undefined ||
		patch.depositAmountCents !== undefined
	) {
		const newTotal =
			(patch.totalAmountCents as bigint | undefined) ??
			booking.totalAmountCents;
		const dep =
			(patch.depositAmountCents as bigint | undefined) ??
			booking.depositAmountCents;
		if (newTotal < 0n || dep < 0n) {
			throw new ConvexError("Amounts cannot be negative");
		}
		if (dep > newTotal) {
			throw new ConvexError("Deposit cannot exceed total amount");
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

	// Commit the claim together with the field patch: one write, so the
	// claim can never be observed disagreeing with the counter it mirrors.
	patch.capacityClaimedScheduleId = nextClaim;
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

/**
 * Restore the matching tourSchedule's capacityBooked counter.
 * Shared by performCancel and performExpire so pending-expiry
 * releases through the SAME atomic decrementBooked path as a
 * manual cancel — never a parallel decrement.
 *
 * Prefers the explicit scheduleId on the booking; falls back to a
 * (tourId, date, startTime) lookup for older bookings that predate
 * the scheduleId field.
 */
export async function releaseBookingCapacity(
	ctx: MutationCtx,
	booking: {
		_id: Id<"bookings">;
		_creationTime: number;
		organizationId: string;
		tourId: Id<"tours">;
		scheduleId?: Id<"tourSchedules">;
		capacityClaimedScheduleId?: Id<"tourSchedules">;
		date: string;
		startTime: string;
		guests: number;
	},
): Promise<void> {
	// F-new-unlinked-booking-capacity-release follow-up (2026-10-04):
	// the c8fc7de guard only covered the scheduleId-absent fallback. A
	// booking whose scheduleId was patched retroactively WITHOUT a paired
	// increment (manual repair, backfill) still drained that schedule here
	// on the explicit path.
	//
	// A capacity claim is the only thing a release may undo, so release
	// targets the claim — never the mutable scheduleId pointer. A booking
	// with no claim releases nothing, which is correct: it never took
	// seats, so there is nothing to give back.
	//
	// A timestamp heuristic was rejected for this (the finding's own
	// reasoning): legitimate moves postdate the booking, so "schedule is
	// older than the booking" cannot distinguish a real claim from a
	// retroactively-patched pointer.
	let scheduleId: Id<"tourSchedules"> | undefined;

	if (booking.capacityClaimedScheduleId) {
		// Authoritative: written only by a paired increment.
		scheduleId = booking.capacityClaimedScheduleId;
	} else {
		// Legacy compatibility. Rows written before the claim field
		// existed carry no claim and are indistinguishable from an
		// unclaimed one, so they keep the pre-existing behavior: prefer
		// scheduleId, else the (tourId, date, startTime) lookup behind
		// the c8fc7de _creationTime guard.
		scheduleId = booking.scheduleId;
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
			// An unlinked booking (free-time request) never incremented
			// any counter — every increment path pairs with a scheduleId
			// on the booking — so a schedule created AFTER the booking
			// cannot hold its seats and must not be decremented. Legacy
			// compatibility: a schedule that already existed when the
			// booking was made keeps the old restore behavior; ties fail
			// open toward release.
			if (schedule && schedule._creationTime > booking._creationTime) {
				logger.warn(
					"[bookingsLifecycle] skip capacity release: schedule postdates unlinked booking",
					{
						bookingId: booking._id,
						scheduleId: schedule._id,
					},
				);
				return;
			}
			scheduleId = schedule?._id;
		}
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
			// Capacity restore is best-effort; the status transition
			// is the source of truth and the schedule can be
			// reconciled manually if needed. But silent swallow
			// hides permanent capacity loss from operators
			// (fleet needs-work 2026-09-08 P1) — log it.
			logger.error("[bookingsLifecycle] decrementBooked failed", {
				scheduleId,
				bookingId: booking._id,
				guests: booking.guests,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
}

export async function performConfirm(
	ctx: MutationCtx,
	booking: {
		_id: Id<"bookings">;
		organizationId: string;
		date: string;
		startTime: string;
		status: BookingStatus;
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
		_creationTime: number;
		organizationId: string;
		customerId: Id<"customers">;
		tourId: Id<"tours">;
		scheduleId?: Id<"tourSchedules">;
		status: BookingStatus;
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
	if (booking.status === "expired" || booking.status === "no_show") {
		throw new ConvexError(`Cannot cancel a ${booking.status} booking`);
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

	await releaseBookingCapacity(ctx, booking);

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

	// Transitions notify the customer via SES (falls back to the
	// built-in cancellation copy when the org has no template).
	await ctx.scheduler.runAfter(
		0,
		internal.notification_dispatch.dispatchImmediateBookingTransition,
		{ bookingId: booking._id, templateType: "booking_cancellation" },
	);
}
export async function performComplete(
	ctx: MutationCtx,
	booking: {
		_id: Id<"bookings">;
		organizationId: string;
		customerId: Id<"customers">;
		status: BookingStatus;
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
	// Terminal state guard: cancelled/expired/no_show bookings must
	// never be completed. performCancel doesn't clear checkedInAt,
	// so a checked-in booking can be cancelled and then erroneously
	// completed via this path. Refuse explicitly.
	if (
		booking.status === "cancelled" ||
		booking.status === "expired" ||
		booking.status === "no_show"
	) {
		throw new ConvexError(`Cannot complete a ${booking.status} booking`);
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

/**
 * Expire a stale pending booking (pending > PENDING_EXPIRY_MS).
 * Terminal transition pending → expired: releases the held seats
 * through the same atomic decrementBooked path as performCancel,
 * cancels queued reminders, and notifies the customer via SES.
 *
 * Caller guards status === "pending" (internalExpire does the
 * load + guard so the cron's fan-out stays per-booking atomic).
 */
export async function performExpire(
	ctx: MutationCtx,
	booking: {
		_id: Id<"bookings">;
		_creationTime: number;
		organizationId: string;
		customerId: Id<"customers">;
		tourId: Id<"tours">;
		scheduleId?: Id<"tourSchedules">;
		status: BookingStatus;
		notes: string;
		date: string;
		startTime: string;
		guests: number;
	},
	userIdForAudit: string,
): Promise<void> {
	if (booking.status !== "pending") {
		throw new ConvexError(
			`Only pending bookings can expire (was ${booking.status})`,
		);
	}

	const now = Date.now();
	await ctx.db.patch(booking._id, {
		status: "expired",
		notes: booking.notes
			? `${booking.notes}\n[EXPIRED] pending confirmation timed out`
			: "[EXPIRED] pending confirmation timed out",
		updatedAt: now,
	});

	// Same atomic capacity-release path as performCancel.
	await releaseBookingCapacity(ctx, booking);

	// Same customer-facing cleanup as cancel: clear nextBookingDate
	// if it pointed at this booking's date.
	const customer = await ctx.db.get(booking.customerId);
	if (customer?.nextBookingDate === booking.date) {
		await ctx.db.patch(booking.customerId, {
			nextBookingDate: undefined,
			updatedAt: now,
		});
	}

	// Cancel any pending scheduledNotifications for this booking so
	// the cron doesn't fire 24h/2h reminders about an expired hold.
	await clearPendingBookingReminders(ctx, booking._id);

	await logAudit(ctx, {
		organizationId: booking.organizationId,
		userId: userIdForAudit,
		action: "booking.expired",
		resourceType: "booking",
		resourceId: booking._id,
		oldValues: { status: "pending" },
		newValues: { status: "expired" },
	});

	await ctx.scheduler.runAfter(
		0,
		internal.notification_dispatch.dispatchImmediateBookingTransition,
		{ bookingId: booking._id, templateType: "booking_expired" },
	);
}

/**
 * Mark a confirmed booking as no_show (confirmed → no_show).
 * Terminal: the tour slot was consumed, so capacity is NOT
 * released — the guest simply never arrived.
 */
export async function performNoShow(
	ctx: MutationCtx,
	booking: {
		_id: Id<"bookings">;
		organizationId: string;
		status: BookingStatus;
	},
	userIdForAudit: string,
): Promise<void> {
	if (booking.status !== "confirmed") {
		throw new ConvexError(
			`Only confirmed bookings can be marked no-show (was ${booking.status})`,
		);
	}

	const now = Date.now();
	await ctx.db.patch(booking._id, {
		status: "no_show",
		updatedAt: now,
	});

	await logAudit(ctx, {
		organizationId: booking.organizationId,
		userId: userIdForAudit,
		action: "booking.no_show",
		resourceType: "booking",
		resourceId: booking._id,
		oldValues: { status: "confirmed" },
		newValues: { status: "no_show" },
	});

	await ctx.scheduler.runAfter(
		0,
		internal.notification_dispatch.dispatchImmediateBookingTransition,
		{ bookingId: booking._id, templateType: "booking_no_show" },
	);
}
