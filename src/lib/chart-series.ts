import type { Id } from "../../convex/_generated/dataModel";

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
