// Time helpers shared across Convex modules.
//
// Kept here (not in convex/scheduledNotifications) so the public
// booking flow can use the same parser when validating dates.

/**
 * Parse a booking date + start-time into a UTC epoch millisecond
 * timestamp. Returns null on malformed input (so callers can
 * surface a clean error message instead of throwing).
 *
 * Accepts:
 *   date:     "YYYY-MM-DD"
 *   startTime: "HH:MM" or "HH:MM:SS"
 */
export function parseBookingTime(
	date: string,
	startTime: string,
): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	const t = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(startTime);
	if (!m || !t) return null;
	const year = Number(m[1]);
	const month = Number(m[2]);
	const day = Number(m[3]);
	const hh = Number(t[1]);
	const mm = Number(t[2]);
	const ss = t[3] ? Number(t[3]) : 0;
	const ts = Date.UTC(year, month - 1, day, hh, mm, ss);
	return Number.isFinite(ts) ? ts : null;
}
