// Shared validation constants + helpers for backend mutations.
//
// Mirrors the FE constants in `src/lib/validation.ts` so a single
// source of truth lives in the user's head even though the two
// runtimes can't import each other. If you change a limit here,
// change it there too.
//
// The public-facing endpoint (POST /api/public/book/:slug) is
// reachable from any visitor — so every input boundary in
// convex/public_booking.ts must be validated here. Dashboard
// mutations are also defended in depth because the FE validates,
// but skipping BE validation has bitten us before (the public
// booking case-dup bug from earlier was caused by missing email
// normalization on the BE side).

/** Max length for human-name fields (customer, guide, driver). */
export const MAX_NAME_LEN = 100;

/** Max length for free-text notes / descriptions. */
export const MAX_NOTES_LEN = 1000;

/** Max length for tour/category descriptions. Same as FE. */
export const MAX_DESCRIPTION_LEN = 2000;

/** Max length for notification template bodies (HTML can run long). */
export const MAX_EMAIL_BODY_LEN = 50_000;

/** Max length for notification template subjects (RFC says 998 max
 *  but most clients truncate at 78; we use 200 to be safe). */
export const MAX_EMAIL_SUBJECT_LEN = 200;

/** Max length for SMS bodies. Single-segment SMS is 160 chars;
 *  multipart SMS (concatenated) is 153*4 = 612. We use 1000 to
 *  cover multi-segment with a margin. */
export const MAX_SMS_BODY_LEN = 1000;

/** Max length for guest-names CSV (one line per guest, joined). */
export const MAX_GUEST_NAMES_LEN = 2000;

/** Max length for a single short field like language code. */
export const MAX_SHORT_FIELD_LEN = 50;

/** Max length for phone-number fields. */
export const MAX_PHONE_LEN = 30;

/** Max length for email addresses (RFC 5321). */
export const MAX_EMAIL_LEN = 254;

/**
 * Same shape check as `EMAIL_REGEX` in src/lib/validation.ts.
 * Catches obvious typos (no @, no TLD, whitespace) before they
 * hit the customers table.
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Trim + lowercase an email. Returns null if invalid shape.
 * Use this at the start of any mutation that accepts email input.
 */
export function normalizeEmail(raw: string): string | null {
	const trimmed = raw.trim().toLowerCase();
	if (trimmed.length === 0 || trimmed.length > MAX_EMAIL_LEN) return null;
	if (!EMAIL_REGEX.test(trimmed)) return null;
	return trimmed;
}

/**
 * Throws ConvexError if any of the supplied lengths exceed the
 * shared limits. Returns the trimmed name. Use this for any
 * public-facing create path.
 */
export function assertValidCustomerInput(input: {
	name: string;
	notes?: string;
	phone?: string;
}): { name: string; notes: string; phone: string } {
	const name = input.name.trim();
	if (name.length < 2) {
		throw new Error("Name must be at least 2 characters");
	}
	if (name.length > MAX_NAME_LEN) {
		throw new Error(`Name is too long (max ${MAX_NAME_LEN} characters)`);
	}
	const notes = input.notes ?? "";
	if (notes.length > MAX_NOTES_LEN) {
		throw new Error(`Notes are too long (max ${MAX_NOTES_LEN} characters)`);
	}
	const phone = input.phone ?? "";
	if (phone.length > MAX_PHONE_LEN) {
		throw new Error(
			`Phone is too long (max ${MAX_PHONE_LEN} characters)`,
		);
	}
	return { name, notes, phone };
}

/**
 * Throws if a free-text booking field exceeds its max length. Use
 * for `bookings.notes`, `recordReview.comment`, `guestNames`, etc.
 * Pass the field's display name for the error message.
 */
export function assertFieldWithinLimit(
	fieldName: string,
	value: string,
	max: number,
): void {
	if (value.length > max) {
		throw new Error(`${fieldName} is too long (max ${max} characters)`);
	}
}