/**
 * Pure time-window helpers for the assignments module (fleet 2d41eaaa
 * slice 2 — lib-extraction precedent). No Convex runtime types: these
 * are string/number functions, unit-testable standalone.
 */

export function timeToMinutes(t: string): number {
	const parts = t.split(":");
	const h = Number.parseInt(parts[0] ?? "0", 10);
	const m = Number.parseInt(parts[1] ?? "0", 10);
	return h * 60 + m;
}

export function minutesToTime(mins: number): string {
	const total = ((mins % 1440) + 1440) % 1440; // wrap past midnight
	const h = Math.floor(total / 60);
	const m = total % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * End time = start + durationHours. Wraps past midnight (matches
 * source's calculate_end_time which returns end_dt.time()).
 */
export function calculateEndTime(
	startTime: string,
	durationHours: number,
): string {
	return minutesToTime(timeToMinutes(startTime) + Math.round(durationHours * 60));
}

/**
 * Returns true iff [startA, endA) overlaps [startB, endB).
 * Both end points may be <= start (a zero-length or backward range
 * never overlaps).
 */
export function rangesOverlap(
	startA: string,
	endA: string,
	startB: string,
	endB: string,
): boolean {
	return (
		timeToMinutes(startA) < timeToMinutes(endB) &&
		timeToMinutes(endA) > timeToMinutes(startB)
	);
}

/** Day number for a YYYY-MM-DD string (UTC days since epoch). */
function dayIndex(date: string): number {
	const [y, m, d] = date.split("-").map(Number);
	return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000;
}

/** Shift a YYYY-MM-DD date by `days` (negative = earlier). */
export function shiftDate(date: string, days: number): string {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days))
		.toISOString()
		.slice(0, 10);
}

/**
 * Absolute-minute window for a dated slot. endTime <= startTime means
 * the assignment wraps past midnight into the next calendar day —
 * endTime "01:00" on 09-05 is really 09-06 01:00 (F62). A missing
 * endTime stays zero-length at start (never overlaps), matching the
 * historical fallback.
 */
function absWindow(
	date: string,
	startTime: string,
	endTime: string | undefined,
): [number, number] {
	const dayStart = dayIndex(date) * 1440;
	const start = dayStart + timeToMinutes(startTime);
	if (endTime === undefined) return [start, start];
	let end = dayStart + timeToMinutes(endTime);
	if (end <= start) end += 1440;
	return [start, end];
}

/** Dated-window overlap — midnight-safe replacement for rangesOverlap. */
export function windowsOverlapAbs(
	aDate: string,
	aStart: string,
	aEnd: string | undefined,
	bDate: string,
	bStart: string,
	bEnd: string | undefined,
): boolean {
	const [as, ae] = absWindow(aDate, aStart, aEnd);
	const [bs, be] = absWindow(bDate, bStart, bEnd);
	return as < be && ae > bs;
}
