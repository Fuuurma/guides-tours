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

/**
 * Validate a bare "YYYY-MM-DD" calendar date; returns its UTC midnight
 * timestamp or null on malformed input. Same strictness as
 * parseBookingTime's date half — the one YYYY-MM-DD rule for the
 * codebase, so callers must not re-roll the regex (F710: dateRange and
 * vacation bounds took any string and compared lexicographically, which
 * orders unpadded dates wrong and parses garbage into NaN).
 */
export function parseYmd(date: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!m) return null;
	const year = Number(m[1]);
	const month = Number(m[2]);
	const day = Number(m[3]);
	if (month < 1 || month > 12) return null;
	if (day < 1 || day > 31) return null;
	const ts = Date.UTC(year, month - 1, day);
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
	return ts;
}

export function parseBookingTime(
	date: string,
	startTime: string,
): number | null {
	const dayTs = parseYmd(date);
	const t = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(startTime);
	if (dayTs === null || !t) return null;
	const hh = Number(t[1]);
	const mm = Number(t[2]);
	const ss = t[3] ? Number(t[3]) : 0;
	if (hh < 0 || hh > 23) return null;
	if (mm < 0 || mm > 59) return null;
	if (ss < 0 || ss > 59) return null;
	// dayTs is UTC midnight; adding the time-of-day offset is identical
	// to Date.UTC(y, m-1, d, hh, mm, ss) — UTC has no DST rollover.
	return dayTs + (hh * 3600 + mm * 60 + ss) * 1000;
}
