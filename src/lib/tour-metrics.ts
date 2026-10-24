export type DailyTourMetric = {
	periodDate: string;
	totalBookings: number;
	totalGuests: number;
	grossRevenueCents: number | bigint;
};

/** Aggregate tourAnalytics daily rows by periodDate (sum across tours). */
export function aggregateDailyTourMetrics(
	rows: Array<{
		periodDate: string;
		periodType?: string;
		totalBookings: number;
		totalGuests: number;
		grossRevenueCents: number | bigint;
	}>,
): DailyTourMetric[] {
	const byDate = new Map<string, DailyTourMetric>();
	for (const r of rows) {
		if (r.periodType && r.periodType !== "daily") continue;
		const prev = byDate.get(r.periodDate) ?? {
			periodDate: r.periodDate,
			totalBookings: 0,
			totalGuests: 0,
			grossRevenueCents: 0,
		};
		prev.totalBookings += r.totalBookings;
		prev.totalGuests += r.totalGuests;
		prev.grossRevenueCents =
			Number(prev.grossRevenueCents) + Number(r.grossRevenueCents);
		byDate.set(r.periodDate, prev);
	}
	return Array.from(byDate.values()).sort((a, b) =>
		a.periodDate.localeCompare(b.periodDate),
	);
}
