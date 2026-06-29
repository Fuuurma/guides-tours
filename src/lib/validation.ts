// Shared validation helpers for dashboard forms.
//
// Centralizes the same patterns the public booking page uses
// (email regex, length checks, phone digits, positive number),
// plus dashboard-specific validators (US-style currency, integer).
//
// All helpers return a string error message or null. Use with
// useEntityForm's `validate` option or render inline via the
// `error` prop on <FormField>.

/**
 * RFC 5322-lite email regex — rejects "a@b" but accepts the common
 * formats the dashboard allows. More permissive than a strict parser
 * to avoid rejecting valid edge-case emails (subdomain.tlds, plus tags).
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MAX_NAME_LEN = 100;
export const MAX_EMAIL_LEN = 254;
export const MAX_PHONE_LEN = 30;
export const MAX_NOTES_LEN = 1000;
export const MAX_DESCRIPTION_LEN = 2000;

/**
 * Validate a name. Required, 2-100 chars after trim.
 * Returns an error message or null.
 */
export function validateName(name: string): string | null {
	const trimmed = name.trim();
	if (trimmed.length < 2) return "Name must be at least 2 characters";
	if (trimmed.length > MAX_NAME_LEN) {
		return `Name is too long (max ${MAX_NAME_LEN} characters)`;
	}
	return null;
}

/**
 * Validate an email. Required, must match EMAIL_REGEX, max 254 chars.
 */
export function validateEmail(email: string): string | null {
	const trimmed = email.trim();
	if (!trimmed) return "Email is required";
	if (!EMAIL_REGEX.test(trimmed)) return "Please enter a valid email address";
	if (trimmed.length > MAX_EMAIL_LEN)
		return `Email is too long (max ${MAX_EMAIL_LEN} characters)`;
	return null;
}

/**
 * Validate a phone (optional). Empty is OK; otherwise 6-20 digits.
 */
export function validatePhoneOptional(phone: string): string | null {
	const trimmed = phone.trim();
	if (!trimmed) return null;
	const digits = trimmed.replace(/\D/g, "");
	if (digits.length < 6 || digits.length > 20) {
		return "Please enter a valid phone number (6-20 digits) or leave it empty";
	}
	return null;
}

/**
 * Validate a free-text notes field (optional). Max 1000 chars.
 */
export function validateNotesOptional(notes: string): string | null {
	if (notes.length > MAX_NOTES_LEN) {
		return `Notes are too long (max ${MAX_NOTES_LEN} characters)`;
	}
	return null;
}

/**
 * Validate a description field (optional). Max 2000 chars.
 */
export function validateDescriptionOptional(
	description: string,
): string | null {
	if (description.length > MAX_DESCRIPTION_LEN) {
		return `Description is too long (max ${MAX_DESCRIPTION_LEN} characters)`;
	}
	return null;
}

/**
 * Validate a positive integer string (used for capacity, guests).
 * Required. Must be > 0 and a whole number.
 */
export function validatePositiveInteger(
	value: string,
	label = "Value",
): string | null {
	if (!value) return `${label} is required`;
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) {
		return `${label} must be a positive number`;
	}
	if (!Number.isInteger(n)) {
		return `${label} must be a whole number`;
	}
	return null;
}

/**
 * Validate a positive number string (used for hours, prices).
 * Required. Must be > 0. Allows decimals.
 */
export function validatePositiveNumber(
	value: string,
	label = "Value",
): string | null {
	if (!value) return `${label} is required`;
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) {
		return `${label} must be a positive number`;
	}
	return null;
}

/**
 * Validate a non-negative number string (used for prices that can be 0).
 * Required. Must be >= 0. Allows decimals.
 */
export function validateNonNegativeNumber(
	value: string,
	label = "Value",
): string | null {
	if (!value) return `${label} is required`;
	const n = Number(value);
	if (!Number.isFinite(n) || n < 0) {
		return `${label} must be a non-negative number`;
	}
	return null;
}

/**
 * Parse a USD dollars string into BigInt cents. Returns null on invalid input.
 * Use for the basePriceCents / depositCents fields in the BE.
 */
export function parseUsdToCents(usd: string): bigint | null {
	if (!usd.trim()) return null;
	const n = Number(usd);
	if (!Number.isFinite(n) || n < 0) return null;
	return BigInt(Math.round(n * 100));
}
