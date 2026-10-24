import type { Id } from "../../convex/_generated/dataModel";

/**
 * Reshape `tourAnalytics.list(periodType=daily, dateFrom, dateTo)`
 * rows into a per-tour daily series. Returns a Map keyed by tourId
 * so the analytics page can build leaderboard rows in O(n).
 *
 * If a tour is missing from the cache (no rows yet), its series is
 * an empty array — the sparkline will render a placeholder rule.
 */
export function buildSparklineByTour(
	rows: Array<{
		tourId: Id<"tours">;
		periodDate: string;
		grossRevenueCents: number | bigint;
	}>,
): Map<string, number[]> {
	// Group by tour, then bucket by date.
	const byTour = new Map<string, Map<string, number>>();
	for (const r of rows) {
		const tid = String(r.tourId);
		let byDate = byTour.get(tid);
		if (!byDate) {
			byDate = new Map();
			byTour.set(tid, byDate);
		}
		byDate.set(
			r.periodDate,
			(byDate.get(r.periodDate) ?? 0) + Number(r.grossRevenueCents),
		);
	}
	const out = new Map<string, number[]>();
	for (const [tid, byDate] of byTour.entries()) {
		const sortedDates = Array.from(byDate.keys()).sort();
		out.set(
			tid,
			sortedDates.map((d) => byDate.get(d) ?? 0),
		);
	}
	return out;
}
