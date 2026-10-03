// Shared date-range helpers for list pages with date filters.
//
// bookings, assignments, schedules use { from, to }.
// analytics uses { startDate, endDate } (matching the Convex API).
//
// Uses local calendar days (not UTC) so "last 30 days" matches what
// operators see on the ops calendar near midnight.

import { addDaysLocal, localYmd } from "./calendar-date";

export interface DateRange {
	startDate: string;
	endDate: string;
}

/**
 * Return the last N days as ISO date strings (local calendar).
 * Default is 30 days.
 */
export function lastNDays(n = 30): DateRange {
	const end = new Date();
	const start = addDaysLocal(end, -(n - 1));
	return {
		startDate: localYmd(start),
		endDate: localYmd(end),
	};
}

/**
 * Return today and the next N-1 days as local calendar dates.
 * Operator lists (schedules, assignments, bookings) are
 * future-focused — a "last 30 days" window hides the week they
 * actually need to staff.
 */
export function upcomingDateRange(n = 30): { from: string; to: string } {
	const start = new Date();
	const end = addDaysLocal(start, n - 1);
	return { from: localYmd(start), to: localYmd(end) };
}

/**
 * Jan 1 (UTC) through today. Uses UTC throughout so the "Jan 1"
 * boundary is in the same timezone as the rest of the date math —
 * a user west of UTC would otherwise see the previous Dec 31.
 */
export function yearToDate(): DateRange {
	const end = new Date();
	const start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
	return {
		startDate: start.toISOString().slice(0, 10),
		endDate: end.toISOString().slice(0, 10),
	};
}
