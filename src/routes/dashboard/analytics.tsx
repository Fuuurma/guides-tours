import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
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

	const rangeArgs = {
		startDate: range.startDate,
		endDate: range.endDate,
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
	const { data: sources } = useQuery(
		convexQuery(api.analytics.getBookingSources, rangeArgs),
	);
	const { data: guideStats } = useQuery(
		convexQuery(api.analytics.getGuideStats, rangeArgs),
	);
	const { data: dailyStats } = useQuery(
		convexQuery(api.analytics.getDailyStats, rangeArgs),
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
				</CardContent>
			</Card>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Top tours</CardTitle>
						<CardDescription>
							Most-booked tours in the selected window
						</CardDescription>
					</CardHeader>
					<CardContent>
						{!topTours || topTours.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No bookings in this window.
							</p>
						) : (
							<ul className="flex flex-col gap-2 text-sm">
								{topTours.map((t) => (
									<li
										key={t.tourId}
										className="flex items-baseline justify-between gap-4 border-b pb-2 last:border-0"
									>
										<Link
											to="/dashboard/tours/$tourId"
											params={{ tourId: t.tourId }}
											className="text-link hover:underline truncate"
										>
											{String(t.tourName ?? "Unknown")}
										</Link>
										<div className="text-right text-xs whitespace-nowrap text-muted-foreground">
											{t.totalBookings} bookings · {t.totalGuests} guests ·{" "}
											{formatCentsWhole(t.totalRevenueCents)}
										</div>
									</li>
								))}
							</ul>
						)}
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
					<CardTitle>Bookings by source</CardTitle>
					<CardDescription>Where your bookings come from</CardDescription>
				</CardHeader>
				<CardContent>
					{!sources || sources.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No bookings in this window.
						</p>
					) : (
						<ul className="grid gap-2 text-sm md:grid-cols-2 md:gap-x-8">
							{sources.map((s) => (
								<li
									key={s.source}
									className="flex items-baseline justify-between gap-4 border-b pb-2 last:border-0 break-inside-avoid"
								>
									<span className="truncate">{s.source}</span>
									<div className="text-right text-xs whitespace-nowrap text-muted-foreground">
										{s.totalBookings} bookings · {s.totalGuests} guests
									</div>
								</li>
							))}
						</ul>
					)}
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
