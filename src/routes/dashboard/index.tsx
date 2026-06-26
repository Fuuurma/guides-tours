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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";

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
					value={
						overview
							? `${overview.completionRate.toFixed(1)}%`
							: "—"
					}
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
							{upcomingAssignments.map((a) => (
								<li
									key={a._id}
									className="flex items-center justify-between border-b pb-2 last:border-0"
								>
									<div>
										<p className="font-medium">
											{a.date} · {a.startTime}–{a.endTime}
										</p>
										<p className="text-muted-foreground text-xs">
											Guide: {a.guideId}
										</p>
									</div>
									<Badge variant="secondary">{a.status}</Badge>
								</li>
							))}
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
			<Card>
				<CardHeader className="pb-2">
					<CardDescription>{label}</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-3xl font-semibold">{value}</p>
				</CardContent>
			</Card>
		</Link>
	);
}