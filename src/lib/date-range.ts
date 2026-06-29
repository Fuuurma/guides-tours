// Shared date-range helpers for list pages with date filters.
//
// bookings, assignments, schedules use { from, to }.
// analytics uses { startDate, endDate } (matching the Convex API).

export interface DateRange {
	startDate: string;
	endDate: string;
}

/**
 * Return the last N days as ISO date strings.
 * Default is 30 days.
 */
export function lastNDays(n = 30): DateRange {
	const end = new Date();
	const start = new Date(end.getTime() - n * 86_400_000);
	return {
		startDate: start.toISOString().slice(0, 10),
		endDate: end.toISOString().slice(0, 10),
	};
}

/**
 * Alias using `from`/`to` keys (used by bookings, assignments, schedules).
 */
export function defaultDateRange(): { from: string; to: string } {
	const { startDate, endDate } = lastNDays();
	return { from: startDate, to: endDate };
}
