import { formatCentsWhole } from "@/lib/format";

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

type Props = {
	days: DailyTourMetric[];
	/** Cap how many bars we render (most recent). */
	maxBars?: number;
};

/**
 * Lightweight CSS bar chart for cached daily tour revenue.
 * No chart library — keeps the analytics page dependency-light.
 */
export function TourRevenueBars({ days, maxBars = 28 }: Props) {
	const slice = days.slice(-maxBars);
	if (slice.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				No cached daily tour metrics yet. Rows appear after the nightly refresh
				when there are bookings.
			</p>
		);
	}

	const maxRevenue = Math.max(
		...slice.map((d) => Number(d.grossRevenueCents)),
		1,
	);

	return (
		<div className="flex flex-col gap-3">
			<div
				className="flex h-36 items-end gap-1"
				role="img"
				aria-label="Daily gross revenue from tour analytics cache"
			>
				{slice.map((d) => {
					const cents = Number(d.grossRevenueCents);
					const pct = Math.max(4, Math.round((cents / maxRevenue) * 100));
					return (
						<div
							key={d.periodDate}
							className="group relative flex min-w-0 flex-1 flex-col items-center justify-end"
							title={`${d.periodDate}: ${formatCentsWhole(cents)} · ${d.totalBookings} bookings`}
						>
							<span className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background group-hover:block">
								{d.periodDate.slice(5)} · {formatCentsWhole(cents)}
							</span>
							<div
								className="w-full max-w-6 rounded-t bg-foreground/80 transition-colors group-hover:bg-foreground"
								style={{ height: `${pct}%` }}
							/>
						</div>
					);
				})}
			</div>
			<div className="flex justify-between text-muted-foreground text-[10px] font-mono">
				<span>{slice[0]?.periodDate}</span>
				<span>{slice[slice.length - 1]?.periodDate}</span>
			</div>
			<p className="text-muted-foreground text-xs">
				{slice.reduce((s, d) => s + d.totalBookings, 0)} bookings ·{" "}
				{formatCentsWhole(
					slice.reduce((s, d) => s + Number(d.grossRevenueCents), 0),
				)}{" "}
				gross (cached daily)
			</p>
		</div>
	);
}
