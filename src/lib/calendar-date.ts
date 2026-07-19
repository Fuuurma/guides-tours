/**
 * Local-calendar date helpers for the ops calendar.
 *
 * Tour dates are stored as YYYY-MM-DD (no timezone). UI "today" and
 * week/month navigation must use the operator's local calendar day —
 * never `toISOString()` / UTC getters, which shift near midnight and
 * month boundaries.
 */

/** Local calendar day as YYYY-MM-DD. */
export function localYmd(d: Date = new Date()): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD into a local Date at midnight. */
export function parseLocalYmd(ymd: string): Date {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
	if (!m) return new Date(NaN);
	return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function startOfMonthLocal(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Sunday-start week (matches the calendar grid header). */
export function startOfWeekLocal(d: Date): Date {
	const day = d.getDay();
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

export function addDaysLocal(d: Date, n: number): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function daysInMonthLocal(year: number, monthIndex: number): number {
	return new Date(year, monthIndex + 1, 0).getDate();
}

export function formatMonthLabel(d: Date): string {
	return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}
