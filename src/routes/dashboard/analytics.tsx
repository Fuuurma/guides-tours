import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useDeferredValue, useMemo, useState } from "react";
import {
	buildSparklineByTour,
	ChannelMixBar,
	TopToursLeaderboard,
} from "@/components/chart-tokens";
import { MetricCard } from "@/components/metric-card";
import {
	aggregateDailyTourMetrics,
	TourRevenueBars,
} from "@/components/tour-revenue-bars";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { DetailSkeleton, Skeleton } from "@/components/ui/skeleton";
import { useOrgMembers } from "@/hooks/use-org-members";
import { type DateRange, lastNDays } from "@/lib/date-range";
import { formatCents, formatCentsWhole } from "@/lib/format";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/analytics")({
	component: AnalyticsPage,
});

function yearToDate(): DateRange {
	// Use UTC throughout so the "Jan 1" boundary is in the same
	// timezone as the rest of the date math. Otherwise, a user in a
	// timezone west of UTC would see "2025-12-31" as their YTD start
	// (because `new Date(2026, 0, 1)` is local-time midnight, which
	// is the previous day in UTC).
	const end = new Date();
	const start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
	return {
		startDate: start.toISOString().slice(0, 10),
		endDate: end.toISOString().slice(0, 10),
	};
}

type Preset = {
	label: string;
	range: DateRange;
};

// Presets are computed on every render so the date math always
// reflects "now" — not when the JS bundle first loaded. With
// module-level constants, the "7d" preset would be "7 days ago
// from the first time anyone opened the page today".
function buildPresets(): Preset[] {
	return [
		{ label: "7d", range: lastNDays(7) },
		{ label: "30d", range: lastNDays() },
		{ label: "90d", range: lastNDays(90) },
		{ label: "YTD", range: yearToDate() },
	];
}

function isPresetActive(
	range: { startDate: string; endDate: string },
	presets: Preset[],
): string | null {
	for (const p of presets) {
		if (
			p.range.startDate === range.startDate &&
			p.range.endDate === range.endDate
		) {
			return p.label;
		}
	}
	return null;
}

function AnalyticsPage() {
	const {
		data: org,
		isPending: orgPending,
		error: orgError,
	} = useQuery(convexQuery(api.organizations.activeOrganization, {}));
	const [range, setRange] = useState(lastNDays);
	// Recompute on every render so the "7d" preset is always
	// "7 days ago from now", not "7 days ago from when the JS
	// bundle first loaded". With a 4-element array this is cheap.
	const presets = buildPresets();
	const activePreset = isPresetActive(range, presets);

	// Debounce date picker keystrokes via useDeferredValue so each
	// typed character doesn't refire all 8 analytics queries. The
	// input stays responsive (it's bound to `range`), while the
	// expensive `rangeArgs` downstream updates on the next tick
	// when React has time. This is the React 19 idiomatic fix —
	// no setTimeout, no debounce hook, no library.
	const deferredRange = useDeferredValue(range);
	const rangeArgs = {
		startDate: deferredRange.startDate,
		endDate: deferredRange.endDate,
	} as const;
	const {
		data: overview,
		isPending: overviewPending,
		error: overviewError,
	} = useQuery(convexQuery(api.analytics.getOverview, rangeArgs));
	const {
		data: revenue,
		isPending: revenuePending,
		error: revenueError,
	} = useQuery(convexQuery(api.analytics.getRevenueSummary, rangeArgs));
	const { data: topTours } = useQuery(
		convexQuery(api.analytics.getTopTours, { ...rangeArgs, limit: 5 }),
	);
	const { data: tourStats } = useQuery(
		convexQuery(api.analytics.getTourStats, rangeArgs),
	);
	const { data: guideStats } = useQuery(
		convexQuery(api.analytics.getGuideStats, rangeArgs),
	);
	const { data: dailyStats } = useQuery(
		convexQuery(api.analytics.getDailyStats, rangeArgs),
	);
	// Tier 2: channel-mix horizontal bar — revenue + booking count
	// per booking source. Uses by_org_date (range-scannable on date).
	const { data: channels } = useQuery(
		convexQuery(api.analytics.getChannelRevenue, rangeArgs),
	);
	// Tier 4: financial-health trio (refund rate / outstanding /
	// deposit coverage). One query, three small cards.
	const { data: financialHealth } = useQuery(
		convexQuery(api.analytics.getFinancialHealth, rangeArgs),
	);
	// Tier 4: public-booking funnel (success rate + per-rejection
	// bucket counts). One query, four small cards.
	const { data: conversions } = useQuery(
		convexQuery(api.analytics.getConversions, rangeArgs),
	);
	const { data: cachedTourDays } = useQuery(
		convexQuery(api.tourAnalytics.list, {
			periodType: "daily",
			dateFrom: range.startDate,
			dateTo: range.endDate,
		}),
	);
	const cachedDailySeries = useMemo(
		() => aggregateDailyTourMetrics(cachedTourDays ?? []),
		[cachedTourDays],
	);
	// Independent 30-day window for the leaderboard sparklines so
	// the trend stays consistent regardless of the user's selected
	// range — operators want "is this tour trending up?" not
	// "show me the trend for whatever window I happen to be on".
	const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
	const thirtyAgo = useMemo(() => {
		const d = new Date(Date.now() - 30 * 86_400_000);
		return d.toISOString().slice(0, 10);
	}, []);
	const { data: leaderboardTourDays } = useQuery(
		convexQuery(api.tourAnalytics.list, {
			periodType: "daily",
			dateFrom: thirtyAgo,
			dateTo: today,
		}),
	);
	const sparklineByTour = useMemo(
		() => buildSparklineByTour((leaderboardTourDays ?? []) as never),
		[leaderboardTourDays],
	);
	const leaderboardTours = useMemo(() => {
		if (!topTours) return [];
		return topTours.map((t) => ({
			tourId: String(t.tourId),
			tourName: String(t.tourName ?? "Unknown"),
			totalBookings: t.totalBookings,
			totalGuests: t.totalGuests,
			totalRevenueCents: t.totalRevenueCents,
			sparkline: sparklineByTour.get(String(t.tourId)) ?? [],
		}));
	}, [topTours, sparklineByTour]);
	const { displayName } = useOrgMembers(["guide", "owner", "admin"]);

	if (orgError || overviewError || revenueError) {
		return (
			<div className="flex flex-col gap-4">
				<h1 className="text-2xl font-semibold">Analytics</h1>
				<ErrorBanner
					message="Failed to load analytics"
					hint={
						orgError?.message ??
						overviewError?.message ??
						revenueError?.message ??
						"Unknown error"
					}
					action={
						<Button
							variant="outline"
							size="sm"
							onClick={() => window.location.reload()}
						>
							Reload
						</Button>
					}
				/>
			</div>
		);
	}

	if (orgPending) {
		return <DetailSkeleton />;
	}
	if (!org) {
		return <p className="text-muted-foreground">No organization selected.</p>;
	}

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold">Analytics</h1>
					<p className="text-muted-foreground text-sm">
						{range.startDate} → {range.endDate}
					</p>
				</div>
				<div className="flex flex-wrap items-end gap-2">
					<label htmlFor="analytics-from" className="text-sm">
						<span className="block text-muted-foreground text-xs">From</span>
						<Input
							id="analytics-from"
							type="date"
							value={range.startDate}
							onChange={(e) =>
								setRange({ ...range, startDate: e.target.value })
							}
						/>
					</label>
					<label htmlFor="analytics-to" className="text-sm">
						<span className="block text-muted-foreground text-xs">To</span>
						<Input
							id="analytics-to"
							type="date"
							value={range.endDate}
							onChange={(e) => setRange({ ...range, endDate: e.target.value })}
						/>
					</label>
					<div className="flex items-end gap-1">
						{presets.map((p) => {
							const isActive = activePreset === p.label;
							return (
								<Button
									key={p.label}
									variant={isActive ? "default" : "outline"}
									size="sm"
									onClick={() => setRange(p.range)}
									aria-pressed={isActive}
								>
									{p.label}
								</Button>
							);
						})}
					</div>
					{activePreset === null && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setRange(lastNDays())}
						>
							Reset
						</Button>
					)}
				</div>
			</header>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{/* Stagger each stat card in 50ms after the previous so the
				    analytics page feels responsive when the data loads.
				    Eye lands on 'Total bookings' first, then naturally
				    follows to the rest. */}
				<motion.div
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.25, delay: 0 }}
				>
					<MetricCard
						label="Total bookings"
						value={overview?.totalAssignments}
						isPending={overviewPending}
					/>
				</motion.div>
				<motion.div
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.25, delay: 0.05 }}
				>
					<MetricCard
						label="Completed"
						value={overview?.completedAssignments}
						isPending={overviewPending}
					/>
				</motion.div>
				<motion.div
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.25, delay: 0.1 }}
				>
					<MetricCard
						label="Cancelled"
						value={overview?.cancelledAssignments}
						isPending={overviewPending}
					/>
				</motion.div>
				<motion.div
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.25, delay: 0.15 }}
				>
					<MetricCard
						label="Completion rate"
						value={
							overview?.completionRate !== undefined
								? `${overview.completionRate}%`
								: undefined
						}
						isPending={overviewPending}
					/>
				</motion.div>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<MetricCard
					label="Tours"
					value={overview?.totalTours}
					isPending={overviewPending}
				/>
				<MetricCard
					label="Guides"
					value={overview?.totalGuides}
					isPending={overviewPending}
				/>
				<MetricCard
					label="Upcoming (7 days)"
					value={overview?.upcomingThisWeek}
					isPending={overviewPending}
				/>
				<MetricCard
					label="Pending vacations"
					value={overview?.pendingVacations}
					isPending={overviewPending}
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Revenue</CardTitle>
					<CardDescription>
						{revenue ? (
							`${revenue.totalBookings} bookings · ${revenue.totalGuests} guests`
						) : (
							<Skeleton className="h-4 w-1/2 inline-block" />
						)}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-3">
						<MetricCard
							label="Gross revenue"
							value={
								revenue ? formatCents(revenue.totalRevenueCents) : undefined
							}
							isPending={revenuePending}
						/>
						<MetricCard
							label="Avg booking"
							value={
								revenue ? formatCents(revenue.avgBookingValueCents) : undefined
							}
							isPending={revenuePending}
						/>
						<MetricCard
							label="Cancellation rate"
							value={revenue ? `${revenue.cancellationRate}%` : undefined}
							isPending={revenuePending}
						/>
					</div>
					{/* Tier 4: financial-health trio — refund rate,
					    outstanding balance, deposit coverage. */}
					<div className="mt-4 grid gap-4 border-t pt-4 md:grid-cols-3">
						<MetricCard
							label="Refund rate"
							value={
								financialHealth ? `${financialHealth.refundRate}%` : undefined
							}
							isPending={!financialHealth}
						/>
						<MetricCard
							label="Outstanding"
							value={
								financialHealth
									? formatCentsWhole(financialHealth.outstandingCents)
									: undefined
							}
							isPending={!financialHealth}
						/>
						<MetricCard
							label="Deposit coverage"
							value={
								financialHealth
									? `${financialHealth.depositCoverage}%`
									: undefined
							}
							isPending={!financialHealth}
						/>
					</div>
				</CardContent>
			</Card>

			{/* Tier 4: public-booking funnel — total attempts, success
			    rate, and per-rejection-bucket counts. Tells the
			    operator whether their booking flow is succeeding or
			    hitting a wall (rate limit / capacity / validation). */}
			<Card>
				<CardHeader>
					<CardTitle>Public booking funnel</CardTitle>
					<CardDescription>
						{conversions
							? `${conversions.totalAttempts} attempt${
									conversions.totalAttempts === 1 ? "" : "s"
								} · ${conversions.successRate}% succeeded`
							: "How guests land on the booking page"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-4">
						<MetricCard
							label="Success rate"
							value={conversions ? `${conversions.successRate}%` : undefined}
							isPending={!conversions}
						/>
						<MetricCard
							label="Attempts"
							value={conversions?.totalAttempts}
							isPending={!conversions}
						/>
						<MetricCard
							label="Rate-limited"
							value={conversions?.rejectedRateLimit}
							isPending={!conversions}
						/>
						<MetricCard
							label="Capacity / validation"
							value={
								conversions
									? conversions.rejectedCapacity +
										conversions.rejectedValidation
									: undefined
							}
							isPending={!conversions}
						/>
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Top tours</CardTitle>
						<CardDescription>
							Most-booked tours in the selected window. 30-day revenue trend in
							the column on the right.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<TopToursLeaderboard tours={leaderboardTours} />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Tour assignments</CardTitle>
						<CardDescription>
							Guides scheduled per tour in this window
						</CardDescription>
					</CardHeader>
					<CardContent>
						{!tourStats || tourStats.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No assignments in this window.
							</p>
						) : (
							<ul className="flex flex-col gap-2 text-sm">
								{tourStats.map((t) => (
									<li
										key={t.tourId}
										className="flex items-baseline justify-between gap-4 border-b pb-2 last:border-0"
									>
										<Link
											to="/dashboard/tours/$tourId"
											params={{ tourId: t.tourId }}
											className="text-link hover:underline truncate"
										>
											{t.tourName}
										</Link>
										<div className="text-right text-xs whitespace-nowrap text-muted-foreground">
											{t.completed}/{t.totalAssignments} done
											{t.cancelled > 0 ? ` · ${t.cancelled} cancelled` : ""}
										</div>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Revenue by channel</CardTitle>
					<CardDescription>
						{channels && channels.length > 0
							? `${channels.length} channel${
									channels.length === 1 ? "" : "s"
								} contributing`
							: "Where your bookings come from"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ChannelMixBar channels={channels ?? []} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Tour revenue (cached)</CardTitle>
					<CardDescription>
						Daily gross from the tourAnalytics snapshot (nightly cron)
					</CardDescription>
				</CardHeader>
				<CardContent>
					<TourRevenueBars days={cachedDailySeries} />
				</CardContent>
			</Card>

			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Guide performance</CardTitle>
						<CardDescription>Assignments completed in range</CardDescription>
					</CardHeader>
					<CardContent>
						{!guideStats || guideStats.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No assignments in this window.
							</p>
						) : (
							<ul className="flex flex-col gap-2 text-sm">
								{guideStats.slice(0, 8).map((g) => (
									<li
										key={g.guideId}
										className="flex items-baseline justify-between gap-4 border-b pb-2 last:border-0"
									>
										<span className="truncate">
											{g.guideId === "unassigned"
												? "Unassigned"
												: displayName(g.guideId)}
										</span>
										<div className="text-right text-xs whitespace-nowrap text-muted-foreground">
											{g.completed}/{g.totalAssignments} done
											{g.cancelled > 0 ? ` · ${g.cancelled} cancelled` : ""}
										</div>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Daily activity</CardTitle>
						<CardDescription>Assignments per day</CardDescription>
					</CardHeader>
					<CardContent>
						{!dailyStats || dailyStats.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No activity in this window.
							</p>
						) : (
							<ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
								{[...dailyStats]
									.sort((a, b) => b.date.localeCompare(a.date))
									.slice(0, 14)
									.map((d) => (
										<li
											key={d.date}
											className="flex items-baseline justify-between gap-4 border-b pb-1.5 last:border-0"
										>
											<span className="font-mono text-xs">{d.date}</span>
											<span className="text-xs text-muted-foreground">
												{d.total} assignments
												{d.completed > 0 ? ` · ${d.completed} done` : ""}
											</span>
										</li>
									))}
							</ul>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
