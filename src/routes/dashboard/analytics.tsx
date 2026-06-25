import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/analytics")({
	component: AnalyticsPage,
});

// Last 30 days as default window
function defaultRange(): { startDate: string; endDate: string } {
	const end = new Date();
	const start = new Date(end.getTime() - 30 * 86_400_000);
	return {
		startDate: start.toISOString().slice(0, 10),
		endDate: end.toISOString().slice(0, 10),
	};
}

function AnalyticsPage() {
	const { data: org, isPending: orgPending } = useQuery(
		convexQuery(api.organizations.activeOrganization, {}),
	);
	const range = defaultRange();

	const overviewArgs =
		org && org.id
			? ({
					organizationId: org.id,
					startDate: range.startDate,
					endDate: range.endDate,
				} as const)
			: null;
	const { data: overview, isPending: overviewPending } = useQuery(
		overviewArgs
			? convexQuery(api.analytics.getOverview, overviewArgs)
			: convexQuery(api.analytics.getOverview, {
					organizationId: "",
					startDate: range.startDate,
					endDate: range.endDate,
				}),
	);
	const { data: revenue } = useQuery(
		overviewArgs
			? convexQuery(api.analytics.getRevenueSummary, overviewArgs)
			: convexQuery(api.analytics.getRevenueSummary, {
					organizationId: "",
					startDate: range.startDate,
					endDate: range.endDate,
				}),
	);

	if (orgPending) return <p className="text-muted-foreground">Loading...</p>;
	if (!org) {
		return <p className="text-muted-foreground">No organization selected.</p>;
	}

	return (
		<div className="space-y-6">
			<header>
				<h1 className="text-2xl font-semibold">Analytics</h1>
				<p className="text-muted-foreground text-sm">
					Last 30 days: {range.startDate} → {range.endDate}
				</p>
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
							: "Loading…"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-3">
						<MetricCard
							label="Gross revenue"
							value={
								revenue
									? `$${(Number(revenue.totalRevenueCents) / 100).toFixed(2)}`
									: undefined
							}
							isPending={!revenue}
						/>
						<MetricCard
							label="Avg booking"
							value={
								revenue
									? `$${(revenue.avgBookingValueCents / 100).toFixed(2)}`
									: undefined
							}
							isPending={!revenue}
						/>
						<MetricCard
							label="Cancellation rate"
							value={
								revenue
									? `${revenue.cancellationRate}%`
									: undefined
							}
							isPending={!revenue}
						/>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function MetricCard({
	label,
	value,
	isPending,
}: {
	label: string;
	value: number | string | undefined;
	isPending: boolean;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardDescription>{label}</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="text-2xl font-semibold">
					{isPending ? "…" : (value ?? "—")}
				</p>
			</CardContent>
		</Card>
	);
}