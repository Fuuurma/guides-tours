import {
	MAX_GUEST_NAMES_LEN,
	MAX_PAYMENT_METHOD_LEN,
	MAX_SHORT_FIELD_LEN,
	parseUsdToCents,
	validateNotesOptional,
	validatePositiveInteger,
} from "@/lib/validation";

export type BookingValues = {
	date: string;
	startTime: string;
	guests: string;
	guestNames: string;
	languageRequired: string;
	notes: string;
	depositUsd: string;
	totalUsd: string;
	paymentMethod: string;
	scheduleId: string;
};

export type BookingUpdatePayload = {
	date: string;
	startTime: string;
	guests: number;
	guestNames?: string;
	languageRequired?: string;
	notes?: string;
	depositAmountCents?: bigint;
	totalAmountCents?: bigint;
	paymentMethod?: string;
	scheduleId: string;
};

/**
 * Submit-time checks for the edit-booking form, extracted verbatim from
 * EditBookingForm.onSubmit. Returns one message per failing field.
 */
export function validateBookingDraft(
	value: BookingValues,
): Partial<Record<keyof BookingValues, string>> {
	const problems: Partial<Record<keyof BookingValues, string>> = {};

	if (!value.date) problems.date = "Date is required";
	if (!value.startTime) problems.startTime = "Start time is required";
	const guestsErr = validatePositiveInteger(value.guests, "Guests");
	if (guestsErr) problems.guests = guestsErr;
	const notesErr = validateNotesOptional(value.notes);
	if (notesErr) problems.notes = notesErr;
	if (value.guestNames.trim().length > MAX_GUEST_NAMES_LEN) {
		problems.guestNames = `Guest names are too long (max ${MAX_GUEST_NAMES_LEN} characters)`;
	}
	if (value.languageRequired.trim().length > MAX_SHORT_FIELD_LEN) {
		problems.languageRequired = `Language is too long (max ${MAX_SHORT_FIELD_LEN} characters)`;
	}
	if (value.paymentMethod.trim().length > MAX_PAYMENT_METHOD_LEN) {
		problems.paymentMethod = `Payment method is too long (max ${MAX_PAYMENT_METHOD_LEN} characters)`;
	}

	const totalCents = value.totalUsd.trim()
		? parseUsdToCents(value.totalUsd)
		: null;
	if (value.totalUsd.trim() && totalCents === null) {
		problems.totalUsd = "Total amount must be a non-negative number";
	}
	const depositCents = value.depositUsd.trim()
		? parseUsdToCents(value.depositUsd)
		: null;
	if (value.depositUsd.trim() && depositCents === null) {
		problems.depositUsd = "Deposit must be a non-negative number";
	} else if (
		depositCents !== null &&
		totalCents !== null &&
		depositCents > totalCents
	) {
		problems.depositUsd = "Deposit cannot exceed the total amount";
	}

	return problems;
}

/**
 * Parses a validated draft into the bookings.update payload shape.
 * Callers apply the Id<> casts for bookingId/scheduleId.
 */
export function buildBookingUpdate(value: BookingValues): BookingUpdatePayload {
	const totalCents = value.totalUsd.trim()
		? parseUsdToCents(value.totalUsd)
		: null;
	const depositCents = value.depositUsd.trim()
		? parseUsdToCents(value.depositUsd)
		: null;
	return {
		date: value.date,
		startTime: value.startTime,
		guests: Number(value.guests),
		guestNames: value.guestNames.trim() || undefined,
		languageRequired: value.languageRequired.trim() || undefined,
		notes: value.notes.trim() || undefined,
		depositAmountCents: depositCents ?? undefined,
		totalAmountCents: totalCents ?? undefined,
		paymentMethod: value.paymentMethod.trim() || undefined,
		scheduleId: value.scheduleId,
	};
}
