// Frontend time utilities — HH:MM arithmetic.
//
// Kept minimal: just helpers the booking/assignment pages need to
// derive end times from start times + tour duration. Backend time
// arithmetic lives in convex/lib/time.ts (separate runtime).

/**
 * Add a number of hours to an HH:MM time string. Returns "" for
 * malformed input rather than producing "NaN:NaN" — callers should
 * gate on this before passing the result into queries.
 *
 * Valid input: exactly two parts separated by ":", both non-empty
 * and parseable as integers. "9:00" is rejected (missing zero-pad on
 * the hour) — callers should normalize before calling.
 */
export function addHours(time: string, hours: number): string {
	const parts = time.split(":");
	if (parts.length !== 2) return "";
	const [rawH, rawM] = parts as [string, string];
	if (!rawH || !rawM) return "";
	// Require both parts to be 1-2 digit integers and "look like HH" —
	// "9:00" is malformed (missing zero-pad), "09:00" is fine.
	if (!/^\d{1,2}$/.test(rawH) || !/^\d{1,2}$/.test(rawM)) return "";
	const h = Number.parseInt(rawH, 10);
	const m = Number.parseInt(rawM, 10);
	if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
	if (h < 0 || h > 23 || m < 0 || m > 59) return "";
	const totalMinutes = h * 60 + m + Math.round(hours * 60);
	const newH = Math.floor(totalMinutes / 60) % 24;
	const newM = totalMinutes % 60;
	return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}
