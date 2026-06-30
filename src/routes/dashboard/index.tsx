import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { formatCentsWhole } from "@/lib/format";
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
	const { data: bookings, error: bookingsError } = useQuery(
		convexQuery(api.bookings.list, {}),
	);
	const { data: assignments, error: assignmentsError } = useQuery(
		convexQuery(api.assignments.list, {}),
	);
	const { data: vacations, error: vacationsError } = useQuery(
		convexQuery(api.vacationRequests.list, {}),
	);
	const { data: customers, error: customersError } = useQuery(
		convexQuery(api.customers.list, {}),
	);
	const { data: tours, error: toursError } = useQuery(
		convexQuery(api.tours.list, {}),
	);

	const { data: overview, error: overviewError } = useQuery(
		convexQuery(api.analytics.getOverview, {
			startDate: today,
			endDate: today,
		}),
	);

	const firstError =
		bookingsError ??
		assignmentsError ??
		vacationsError ??
		customersError ??
		toursError ??
		overviewError;

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
			{firstError && (
				<ErrorBanner
					message={`Some data failed to load: ${firstError.message}`}
					hint="Cards below may show stale or empty data. Refresh to retry."
				/>
			)}
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
												{tourName ? (
													<Link
														to="/dashboard/tours/$tourId"
														params={{ tourId: a.tourId }}
														className="hover:underline"
													>
														{tourName}
													</Link>
												) : (
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
											className="text-link hover:underline text-xs ml-2"
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

			{todaysBookings.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Today's bookings</CardTitle>
						<CardDescription>
							{todaysBookings.length} booking
							{todaysBookings.length === 1 ? "" : "s"} scheduled for today
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="space-y-2">
							{todaysBookings.slice(0, 5).map((b) => {
								const tourName = tourNameById.get(String(b.tourId));
								return (
									<li
										key={b._id}
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
												{b.startTime} · {b.guests} guest
												{b.guests === 1 ? "" : "s"} ·{" "}
												{formatCentsWhole(b.totalAmountCents)}
											</p>
										</div>
										<Link
											to="/dashboard/bookings/$bookingId"
											params={{ bookingId: b._id as Id<"bookings"> }}
											className="text-link hover:underline text-xs ml-2"
										>
											View →
										</Link>
									</li>
								);
							})}
							{todaysBookings.length > 5 && (
								<li className="text-xs text-muted-foreground pt-1">
									+ {todaysBookings.length - 5} more —{" "}
									<Link
										to="/dashboard/bookings"
										className="text-link hover:underline"
									>
										view all bookings
									</Link>
								</li>
							)}
						</ul>
					</CardContent>
				</Card>
			)}
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
			className="block transition-colors hover:bg-muted rounded-md"
		>
			<MetricCard label={label} value={value} />
		</Link>
	);
}
