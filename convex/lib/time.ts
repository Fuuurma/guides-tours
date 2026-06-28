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
 *
 * Rejects:
 *   - Out-of-range months/days/hours/minutes (e.g. "2026-02-31")
 *   - Feb 29 in non-leap years
 *   - HH:MM where minutes >= 60
 *
 * Without the explicit range checks, Date.UTC silently rolls over
 * invalid dates — Feb 31 → Mar 3 — and bookings would silently land
 * on the wrong day.
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
	if (month < 1 || month > 12) return null;
	if (day < 1 || day > 31) return null;
	if (hh < 0 || hh > 23) return null;
	if (mm < 0 || mm > 59) return null;
	if (ss < 0 || ss > 59) return null;
	const ts = Date.UTC(year, month - 1, day, hh, mm, ss);
	if (!Number.isFinite(ts)) return null;
	// Verify the parsed timestamp round-trips back to the same
	// calendar date — Date.UTC rolls over (Feb 31 → Mar 3), and
	// accepting that would silently book the wrong day.
	const checkDate = new Date(ts);
	if (
		checkDate.getUTCFullYear() !== year ||
		checkDate.getUTCMonth() !== month - 1 ||
		checkDate.getUTCDate() !== day
	) {
		return null;
	}
	if (
		checkDate.getUTCHours() !== hh ||
		checkDate.getUTCMinutes() !== mm
	) {
		return null;
	}
	return ts;
}
