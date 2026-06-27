import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/")({
	component: DashboardIndex,
});

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

function DashboardIndex() {
	const today = todayIso();
	const { data: org } = useQuery(
		convexQuery(api.organizations.activeOrganization, {}),
	);
	const { data: bookings } = useQuery(convexQuery(api.bookings.list, {}));
	const { data: assignments } = useQuery(convexQuery(api.assignments.list, {}));
	const { data: vacations } = useQuery(convexQuery(api.vacationRequests.list, {}));
	const { data: customers } = useQuery(convexQuery(api.customers.list, {}));
	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));

	const { data: overview } = useQuery(
		convexQuery(api.analytics.getOverview, {
			startDate: today,
			endDate: today,
		}),
	);

	const tourNameById = new Map<string, string>(
		(tours ?? []).map((t) => [String(t._id), t.name]),
	);

	const todaysBookings = (bookings?.items ?? []).filter(
		(b) => b.date === today,
	);
	const upcomingAssignments = (assignments ?? [])
		.filter((a) => a.status === "scheduled" && a.date >= today)
		.sort((a, b) => a.date.localeCompare(b.date))
		.slice(0, 5);
	const pendingVacations = (vacations ?? []).filter(
		(v) => v.status === "pending",
	).length;
	const totalCustomers = customers?.items?.length ?? 0;
	const totalTours = (tours ?? []).filter((t) => t.isActive).length;

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Today</h1>
					<p className="text-muted-foreground text-sm">
						{new Date().toLocaleDateString(undefined, {
							weekday: "long",
							month: "long",
							day: "numeric",
						})}
						{" · "}
						{org?.name ?? "your workspace"}
					</p>
				</div>
				<Button asChild>
					<Link to="/dashboard/bookings/new">+ New booking</Link>
				</Button>
			</header>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<StatCard
					label="Bookings today"
					value={todaysBookings.length}
					link="/dashboard/bookings"
				/>
				<StatCard
					label="Upcoming assignments"
					value={upcomingAssignments.length}
					link="/dashboard/assignments"
				/>
				<StatCard
					label="Pending vacations"
					value={pendingVacations}
					link="/dashboard/vacations"
				/>
				<StatCard
					label="Total customers"
					value={totalCustomers}
					link="/dashboard/customers"
				/>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<StatCard
					label="Active tours"
					value={totalTours}
					link="/dashboard/tours"
				/>
				<StatCard
					label="Completion rate (today)"
					value={overview ? `${overview.completionRate.toFixed(1)}%` : "—"}
					link="/dashboard/analytics"
				/>
				<StatCard
					label="Cancellations (today)"
					value={overview?.cancelledAssignments ?? 0}
					link="/dashboard/analytics"
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Upcoming assignments</CardTitle>
					<CardDescription>
						Next {upcomingAssignments.length} scheduled assignments
					</CardDescription>
				</CardHeader>
				<CardContent>
					{upcomingAssignments.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No upcoming assignments.
						</p>
					) : (
						<ul className="space-y-2">
							{upcomingAssignments.map((a) => {
								const tourName = tourNameById.get(String(a.tourId));
								return (
									<li
										key={a._id}
										className="flex items-center justify-between border-b pb-2 last:border-0"
									>
										<div className="min-w-0 flex-1">
											<p className="font-medium truncate">
												{tourName ?? (
													<span className="text-muted-foreground italic">
														Unknown tour
													</span>
												)}
											</p>
											<p className="text-muted-foreground text-xs">
												{a.date} · {a.startTime}–{a.endTime} · Guide {a.guideId}
											</p>
										</div>
										<Link
											to="/dashboard/assignments/$assignmentId"
											params={{ assignmentId: a._id as Id<"assignments"> }}
											className="text-blue-600 hover:underline text-xs ml-2"
										>
											View →
										</Link>
									</li>
								);
							})}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function StatCard({
	label,
	value,
	link,
}: {
	label: string;
	value: number | string;
	link: string;
}) {
	return (
		<Link
			to={link}
			className="block transition-colors hover:bg-gray-50 rounded-md"
		>
			<MetricCard label={label} value={value} />
		</Link>
	);
}
