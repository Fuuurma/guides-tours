import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DetailSkeleton, Skeleton } from "@/components/ui/skeleton";
import { formatCents, formatCentsWhole } from "@/lib/format";
import { lastNDays, type DateRange } from "@/lib/date-range";
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
	const { data: sources } = useQuery(
		convexQuery(api.analytics.getBookingSources, rangeArgs),
	);

	if (orgError || overviewError || revenueError) {
		return (
			<div className="space-y-4">
				<h1 className="text-2xl font-semibold">Analytics</h1>
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
					<p className="text-destructive text-sm font-medium">
						Failed to load analytics
					</p>
					<p className="text-muted-foreground text-xs mt-1">
						{orgError?.message ??
							overviewError?.message ??
							revenueError?.message ??
							"Unknown error"}
					</p>
					<Button
						variant="outline"
						size="sm"
						className="mt-2"
						onClick={() => window.location.reload()}
					>
						Reload
					</Button>
				</div>
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
		<div className="space-y-6">
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
				<MetricCard
					label="Total bookings"
					value={overview?.totalAssignments}
					isPending={overviewPending}
				/>
				<MetricCard
					label="Completed"
					value={overview?.completedAssignments}
					isPending={overviewPending}
				/>
				<MetricCard
					label="Cancelled"
					value={overview?.cancelledAssignments}
					isPending={overviewPending}
				/>
				<MetricCard
					label="Completion rate"
					value={
						overview?.completionRate !== undefined
							? `${overview.completionRate}%`
							: undefined
					}
					isPending={overviewPending}
				/>
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
						{revenue
							? `${revenue.totalBookings} bookings · ${revenue.totalGuests} guests`
							: <Skeleton className="h-4 w-1/2 inline-block" />}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-3">
						<MetricCard
							label="Gross revenue"
							value={
								revenue
									? formatCents(revenue.totalRevenueCents)
									: undefined
							}
							isPending={revenuePending}
						/>
						<MetricCard
							label="Avg booking"
							value={
								revenue
									? formatCents(revenue.avgBookingValueCents as unknown as number)
									: undefined
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
							<ul className="space-y-2 text-sm">
								{topTours.map((t) => (
									<li
										key={t.tourId}
										className="flex items-baseline justify-between gap-4 border-b pb-2 last:border-0"
									>
										<Link
											to="/dashboard/tours/$tourId"
											params={{ tourId: t.tourId }}
											className="text-blue-600 hover:underline truncate"
										>
											{String(t.tourName ?? "Unknown")}
										</Link>
										<div className="text-right text-xs whitespace-nowrap text-muted-foreground">
									{t.totalBookings} bookings · {t.totalGuests} guests · {formatCentsWhole(t.totalRevenueCents)}
										</div>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>

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
							<ul className="space-y-2 text-sm">
								{sources.map((s) => (
									<li
										key={s.source}
										className="flex items-baseline justify-between gap-4 border-b pb-2 last:border-0"
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
			</div>
		</div>
	);
}
