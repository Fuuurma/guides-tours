// Time helpers shared across Convex modules.
//
// Kept here (not in convex/scheduledNotifications) so the public
// booking flow can use the same parser when validating dates.

import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Fallback zone for operators without organizationSettings.timeZone. */
export const DEFAULT_TIME_ZONE = "Europe/Madrid";

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
	const t = parseHms(startTime);
	if (dayTs === null || t === null) return null;
	const [hh, mm, ss] = t;
	// dayTs is UTC midnight; adding the time-of-day offset is identical
	// to Date.UTC(y, m-1, d, hh, mm, ss) — UTC has no DST rollover.
	return dayTs + (hh * 3600 + mm * 60 + ss) * 1000;
}

/**
 * Parse a booking date + start-time as a wall-clock time in `timeZone`
 * and return the corresponding UTC epoch ms. Same strictness as
 * parseBookingTime for malformed input; the difference is the zone:
 * "10:00" on 2026-07-15 in Europe/Madrid resolves to 08:00 UTC, not
 * 10:00 UTC, so "cannot book in the past" and bookingCutoffHours
 * compare against the instant the operator actually means.
 *
 * DST edges resolve like Temporal's "compatible" disambiguation:
 * an ambiguous wall time (autumn fold) takes the first occurrence; a
 * nonexistent one (spring gap) shifts forward by the gap. Both keep
 * well-formed input parseable — null stays reserved for malformed
 * dates/times. An unknown zone id falls back to UTC semantics.
 */
export function parseBookingTimeInZone(
	date: string,
	startTime: string,
	timeZone: string = DEFAULT_TIME_ZONE,
): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!m) return null;
	const year = Number(m[1]);
	const month = Number(m[2]);
	const day = Number(m[3]);
	if (parseYmd(date) === null) return null;
	const t = parseHms(startTime);
	if (t === null) return null;
	const fmt = zoneFormatter(timeZone);
	if (fmt === null) {
		console.warn(
			`[time] unknown IANA zone "${timeZone}" — parsing as UTC`,
		);
		return parseBookingTime(date, startTime);
	}
	return zonedWallToUtc(year, month, day, t[0], t[1], t[2], fmt);
}

/**
 * The operator's IANA zone: organizationSettings.timeZone when the org
 * has a settings row with a valid zone id, else DEFAULT_TIME_ZONE.
 * Indexed unique lookup — safe to call once per mutation/query body.
 */
export async function organizationTimeZone(
	ctx: QueryCtx | MutationCtx,
	organizationId: string,
): Promise<string> {
	const row = await ctx.db
		.query("organizationSettings")
		.withIndex("by_org", (q) => q.eq("organizationId", organizationId))
		.unique();
	const tz = row?.timeZone;
	if (tz === undefined) return DEFAULT_TIME_ZONE;
	if (zoneFormatter(tz) === null) {
		console.warn(
			`[time] org ${organizationId} has invalid timeZone "${tz}" — using ${DEFAULT_TIME_ZONE}`,
		);
		return DEFAULT_TIME_ZONE;
	}
	return tz;
}

function parseHms(startTime: string): [number, number, number] | null {
	const t = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(startTime);
	if (!t) return null;
	const hh = Number(t[1]);
	const mm = Number(t[2]);
	const ss = t[3] ? Number(t[3]) : 0;
	if (hh > 23 || mm > 59 || ss > 59) return null;
	return [hh, mm, ss];
}

const dtfCache = new Map<string, Intl.DateTimeFormat | null>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat | null {
	let fmt = dtfCache.get(timeZone);
	if (fmt === undefined) {
		try {
			fmt = new Intl.DateTimeFormat("en-US", {
				timeZone,
				hourCycle: "h23",
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
			});
		} catch {
			fmt = null;
		}
		dtfCache.set(timeZone, fmt);
	}
	return fmt;
}

/** Wall-clock fields of `ts` read in the formatter's zone. */
function wallParts(
	ts: number,
	fmt: Intl.DateTimeFormat,
): [number, number, number, number, number, number] {
	const parts = fmt.formatToParts(new Date(ts));
	const pick = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((p) => p.type === type)?.value);
	return [
		pick("year"),
		pick("month"),
		pick("day"),
		pick("hour") % 24,
		pick("minute"),
		pick("second"),
	];
}

/** ms to add to `ts` so its UTC reading matches its wall reading in the zone. */
function zoneOffsetMs(ts: number, fmt: Intl.DateTimeFormat): number {
	const [y, mo, d, hh, mi, ss] = wallParts(ts, fmt);
	return Date.UTC(y, mo - 1, d, hh, mi, ss) - ts;
}

const DAY_MS = 24 * 3_600_000;

function zonedWallToUtc(
	year: number,
	month: number,
	day: number,
	hh: number,
	mm: number,
	ss: number,
	fmt: Intl.DateTimeFormat,
): number {
	const guess = Date.UTC(year, month - 1, day, hh, mm, ss);
	// Sample the zone a day either side of the guess so both offset
	// regimes around a DST transition are covered (a ±24h window cannot
	// straddle more than two regimes for IANA zones).
	const candidates = new Set<number>();
	for (const probe of [guess - DAY_MS, guess + DAY_MS]) {
		candidates.add(guess - zoneOffsetMs(probe, fmt));
	}
	const sorted = [...candidates].sort((a, b) => a - b);
	const matches = (ts: number) => {
		const [wy, wm, wd, wh, wmi, ws] = wallParts(ts, fmt);
		return (
			wy === year &&
			wm === month &&
			wd === day &&
			wh === hh &&
			wmi === mm &&
			ws === ss
		);
	};
	for (const ts of sorted) {
		if (matches(ts)) return ts;
	}
	// Neither regime produces this wall time: it sits inside a spring
	// gap, so the instant is shifted forward by the gap — the candidate
	// from the pre-transition offset lands exactly that far ahead.
	return sorted[sorted.length - 1];
}
