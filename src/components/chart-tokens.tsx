// Tier 2 showcase-quality chart primitives.
//
// Three small, dependency-free React components that power the
// analytics page:
//
//   <Sparkline />             — 30-line SVG sparkline (no library)
//   <ChannelMixBar />         — horizontal stacked bar with per-source
//                                segments + hover reveal
//   <TopToursLeaderboard />   — top N tours with revenue + sparkline
//
// All three read from existing Convex data and follow the
// DESIGN.md ocean / sand / coral palette by mapping source names
// to the `chart-1..5` semantic tokens that already encode the
// palette in src/styles.css.

import { Link } from "@tanstack/react-router";
import type { Id } from "@/../convex/_generated/dataModel";
import { formatCentsWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

// ---- chart-token palette mapping ----
//
// Stable mapping from source name → chart-token index. Known
// channels go through the mapping; anything else falls back to
// `chart-5` so it still renders. The numeric indices line up with
// the order operators see most: direct (own) is chart-1 (coral),
// the big three OTAs (viator/getyourguide/booking) follow, the
// long tail gets the cooler hues.

const SOURCE_PALETTE = [
	"direct",
	"viator",
	"getyourguide",
	"booking",
	"airbnb",
	"expedia",
	"klook",
	"tripadvisor",
	"website",
	"manual",
] as const;

function sourceColorClass(
	source: string,
	prefix: "bg" | "text" = "bg",
): string {
	const idx = SOURCE_PALETTE.indexOf(
		source.toLowerCase() as (typeof SOURCE_PALETTE)[number],
	);
	if (idx < 0) {
		return `${prefix}-chart-5`;
	}
	// 0..4 → chart-1..5
	const slot = (idx % 5) + 1;
	return `${prefix}-chart-${slot}`;
}

// ---- Sparkline ----

type SparklineProps = {
	/** Y-values, oldest → newest. Any length; 0-1 mapped to height. */
	values: number[];
	/** Pixel height of the SVG viewBox. Default 28. */
	height?: number;
	/** Pixel width of the SVG viewBox. Default 120. */
	width?: number;
	/** Optional colour token; defaults to chart-2 (ocean). */
	colorClass?: string;
	ariaLabel?: string;
};

/**
 * Pure SVG sparkline. ~30 lines of code, zero dependencies. Used
 * inline in the top-tours leaderboard to show 30-day revenue
 * trend per tour.
 *
 * Empty values array renders a placeholder rule so the row height
 * stays stable while the data loads.
 */
export function Sparkline({
	values,
	height = 28,
	width = 120,
	colorClass = "stroke-chart-2",
	ariaLabel = "Trend",
}: SparklineProps) {
	if (values.length === 0) {
		return (
			<svg
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={`${ariaLabel}: no data`}
				className="text-muted-foreground/30"
			>
				<line
					x1={0}
					y1={height / 2}
					x2={width}
					y2={height / 2}
					stroke="currentColor"
					strokeWidth={1}
					strokeDasharray="2 4"
				/>
			</svg>
		);
	}

	const max = Math.max(...values, 1);
	const stepX = values.length > 1 ? width / (values.length - 1) : width;
	const points = values.map((v, i) => {
		const x = i * stepX;
		// Pad top/bottom by 2px so the line doesn't touch the edge.
		const yRatio = v / max;
		const y = height - 2 - yRatio * (height - 4);
		return `${x},${y}`;
	});
	const path = `M ${points.join(" L ")}`;

	return (
		<svg
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label={ariaLabel}
			className={cn("overflow-visible", colorClass)}
		>
			<path
				d={path}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{/* End-point dot — gives the eye an anchor. */}
			{points.length > 0 ? (
				<circle
					cx={points.at(-1)?.split(",")[0]}
					cy={points.at(-1)?.split(",")[1]}
					r={2}
					fill="currentColor"
				/>
			) : null}
		</svg>
	);
}

// ---- ChannelMixBar ----

type ChannelDatum = {
	source: string;
	totalBookings: number;
	totalGuests: number;
	totalRevenueCents: number;
};

type ChannelMixBarProps = {
	channels: ChannelDatum[];
	/** When true, render a compact version with just totals (no per-segment labels). */
	compact?: boolean;
};

/**
 * Horizontal stacked bar showing revenue share per booking source.
 * Each segment's width is `revenue / total`. Hover reveals a popover
 * with the source name + booking count + guest count + revenue.
 *
 * Replaces the static `<ul>` bookend block on the analytics page.
 */
export function ChannelMixBar({
	channels,
	compact = false,
}: ChannelMixBarProps) {
	const total = channels.reduce((s, c) => s + c.totalRevenueCents, 0);
	if (total === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No revenue in this window. Bookings will appear here as they come in.
			</p>
		);
	}

	// Sticky "long-tail" bucket — anything below 1.5% of revenue
	// collapses into one "Other" segment so the bar stays legible
	// when there are 10+ sources.
	const MIN_PCT = 0.015;
	const tail: ChannelDatum[] = [];
	const primary = channels.filter((c) => {
		const pct = c.totalRevenueCents / total;
		if (pct < MIN_PCT) {
			tail.push(c);
			return false;
		}
		return true;
	});
	const segments =
		tail.length > 0
			? [
					...primary,
					{
						source: "Other",
						totalBookings: tail.reduce((s, c) => s + c.totalBookings, 0),
						totalGuests: tail.reduce((s, c) => s + c.totalGuests, 0),
						totalRevenueCents: tail.reduce(
							(s, c) => s + c.totalRevenueCents,
							0,
						),
					},
				]
			: primary;

	return (
		<div className="flex flex-col gap-3">
			<div
				className="flex h-10 w-full overflow-hidden rounded-md border bg-muted/30"
				role="img"
				aria-label="Revenue by booking source"
			>
				{segments.map((c) => {
					const pct = (c.totalRevenueCents / total) * 100;
					if (pct === 0) return null;
					return (
						<div
							key={c.source}
							className={cn(
								"group relative flex h-full items-center justify-center text-[10px] font-medium text-white transition-opacity hover:opacity-90",
								sourceColorClass(c.source, "bg"),
							)}
							style={{ width: `${pct}%` }}
							title={`${c.source}: ${formatCentsWhole(c.totalRevenueCents)} · ${c.totalBookings} bookings`}
						>
							{/* Show label only when segment is wide enough. */}
							{pct >= 8 ? (
								<span className="px-1 truncate">{Math.round(pct)}%</span>
							) : null}
						</div>
					);
				})}
			</div>
			{!compact ? (
				<ul className="grid gap-2 text-sm md:grid-cols-2 md:gap-x-8">
					{segments.map((c) => {
						const pct = (c.totalRevenueCents / total) * 100;
						return (
							<li
								key={c.source}
								className="flex items-baseline justify-between gap-4 border-b pb-2 last:border-0 break-inside-avoid"
							>
								<div className="flex min-w-0 items-center gap-2">
									<span
										aria-hidden="true"
										className={cn(
											"inline-block size-2.5 shrink-0 rounded-sm",
											sourceColorClass(c.source, "bg"),
										)}
									/>
									<span className="truncate">{c.source}</span>
								</div>
								<div className="text-right text-xs whitespace-nowrap text-muted-foreground">
									{formatCentsWhole(c.totalRevenueCents)} · {c.totalBookings}{" "}
									booking{c.totalBookings === 1 ? "" : "s"} · {Math.round(pct)}%
								</div>
							</li>
						);
					})}
				</ul>
			) : null}
		</div>
	);
}

// ---- TopToursLeaderboard ----

type LeaderboardTour = {
	tourId: string;
	tourName: string;
	totalBookings: number;
	totalGuests: number;
	totalRevenueCents: number;
	/** 30-day daily revenue series, oldest → newest. Empty if no cached rows. */
	sparkline: number[];
};

type LeaderboardProps = {
	tours: LeaderboardTour[];
	/** Optional click-through target — defaults to /dashboard/tours/$tourId */
};

/**
 * Ranked list of tours by revenue, each with a 30-day sparkline.
 * Replaces the static `<ul>` "Top tours" card on the analytics
 * page. The sparkline uses the cached `tourAnalytics` daily rows
 * so it costs nothing extra to render — they're already fetched
 * by the page for the daily-revenue chart.
 */
export function TopToursLeaderboard({ tours }: LeaderboardProps) {
	if (tours.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No bookings in this window yet. Top tours appear here once your direct
				link, OTAs, or phone bookings start rolling in.
			</p>
		);
	}
	const maxRevenue = Math.max(...tours.map((t) => t.totalRevenueCents), 1);
	return (
		<ul className="flex flex-col">
			{tours.map((t, idx) => {
				const pct = (t.totalRevenueCents / maxRevenue) * 100;
				return (
					<li
						key={t.tourId}
						className="group relative border-b py-3 last:border-0"
					>
						{/* Background revenue-magnitude bar — gives the eye a
						    one-glance ranking cue without competing with the
						    sparkline. */}
						<span
							aria-hidden="true"
							className="absolute inset-y-0 left-0 -z-10 bg-chart-1/5 transition-colors group-hover:bg-chart-1/10"
							style={{ width: `${pct}%` }}
						/>
						<div className="flex items-center gap-4">
							<span className="w-5 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
								{idx + 1}
							</span>
							<div className="min-w-0 flex-1">
								<Link
									to="/dashboard/tours/$tourId"
									params={{ tourId: t.tourId as Id<"tours"> }}
									className="block truncate text-sm font-medium text-link hover:underline"
								>
									{t.tourName}
								</Link>
								<p className="text-xs text-muted-foreground">
									{t.totalBookings} booking{t.totalBookings === 1 ? "" : "s"} ·{" "}
									{t.totalGuests} guest{t.totalGuests === 1 ? "" : "s"}
								</p>
							</div>
							<Sparkline
								values={t.sparkline}
								ariaLabel={`${t.tourName} 30-day revenue trend`}
							/>
							<div className="w-24 shrink-0 text-right text-sm tabular-nums">
								{formatCentsWhole(t.totalRevenueCents)}
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}

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
