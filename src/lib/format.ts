// Shared formatters for dashboard + public booking pages.
//
// Cents-only money values (v.int64() from Convex) need to be
// divided by 100 and rendered with currency-style formatting.
// This module centralizes the two patterns we use:

/**
 * Format a cents value as a USD currency string.
 *
 * @example
 *   formatCents(4999)      // "$49.99"
 *   formatCents(4999n)     // "$49.99"  (bigint works too)
 *   formatCents(0)         // "$0.00"
 *   formatCents(123456)    // "$1,234.56"
 */
export function formatCents(cents: number | bigint | null | undefined): string {
	if (cents == null) return "$0.00";
	const n = typeof cents === "bigint" ? Number(cents) : cents;
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(n / 100);
}

/**
 * Format a cents value as a plain "$X.XX" string with no grouping.
 * Cheaper than formatCents for high-volume table cells.
 *
 * @example
 *   formatCentsCompact(4999)   // "$49.99"
 *   formatCentsCompact(4999n)  // "$49.99"
 */
export function formatCentsCompact(
	cents: number | bigint | null | undefined,
): string {
	if (cents == null) return "$0.00";
	const n = typeof cents === "bigint" ? Number(cents) : cents;
	return `$${(n / 100).toFixed(2)}`;
}

/**
 * Format a cents value as "$X" with no decimals or grouping.
 * Use in compact dashboard cards where cents are distracting.
 *
 * @example
 *   formatCentsWhole(375000)  // "$3750"
 *   formatCentsWhole(0)       // "$0"
 */
export function formatCentsWhole(
	cents: number | bigint | null | undefined,
): string {
	if (cents == null) return "$0";
	const n = typeof cents === "bigint" ? Number(cents) : cents;
	return `$${Math.round(n / 100)}`;
}

/**
 * Convert a cents value to a plain decimal string for form inputs.
 * Strips the "$" prefix so it can go directly into a text input.
 *
 * @example
 *   centsToInputValue(4999)   // "49.99"
 *   centsToInputValue(0)      // "0.00"
 *   centsToInputValue(null)   // ""
 */
export function centsToInputValue(
	cents: number | bigint | null | undefined,
): string {
	if (cents == null) return "";
	const n = typeof cents === "bigint" ? Number(cents) : cents;
	return (n / 100).toFixed(2);
}
