import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { formatCentsWhole } from "@/lib/format";
import { addDaysLocal, localYmd } from "@/lib/calendar-date";
import { getErrorMessage } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/")({
	component: DashboardIndex,
});

function DashboardIndex() {
	const today = localYmd();
	const weekTo = localYmd(addDaysLocal(new Date(), 6));
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
	const { data: staffingGaps, error: staffingError } = useQuery(
		convexQuery(api.assignments.staffingGaps, {
			dateFrom: today,
			dateTo: weekTo,
		}),
	);
	const { data: missingPhones, error: missingPhoneError } = useQuery(
		convexQuery(api.userProfiles.missingStaffPhones, {
			dateFrom: today,
			dateTo: weekTo,
		}),
	);
	const { data: remindStatus } = useQuery(
		convexQuery(api.phoneReminders.cooldownStatus, {
			dateFrom: today,
			dateTo: weekTo,
		}),
	);

	const { data: overview, error: overviewError } = useQuery(
		convexQuery(api.analytics.getOverview, {
			startDate: today,
			endDate: today,
		}),
	);

	const sendPhoneReminders = useMutation(api.phoneReminders.sendReminders);
	const [remindPending, setRemindPending] = useState(false);

	const firstError =
		bookingsError ??
		assignmentsError ??
		vacationsError ??
		customersError ??
		toursError ??
		staffingError ??
		missingPhoneError ??
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
	const gaps = staffingGaps ?? [];
	const gapsToday = gaps.filter((g) => g.date === today).length;
	const topGaps = gaps.slice(0, 5);
	const missing = missingPhones ?? [];
	const topMissing = missing.slice(0, 5);

	const onRemindPhones = async () => {
		setRemindPending(true);
		try {
			const result = await sendPhoneReminders({
				dateFrom: today,
				dateTo: weekTo,
			});
			toast.success(
				`Reminders queued for ${result.eligible} staff${
					result.capped ? " (capped at 50)" : ""
				}${
					result.coolingDown
						? ` · ${result.coolingDown} still in 7-day cooldown`
						: ""
				}`,
			);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setRemindPending(false);
		}
	};

	return (
		<div className="space-y-6">
			{firstError && (
				<ErrorBanner
					message={`Some data failed to load: ${firstError.message}`}
					hint="Cards below may show stale or empty data. Refresh to retry."
				/>
			)}
			<header className="flex items-center justify-between">
				<motion.div
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.25, ease: "easeOut" }}
				>
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
				</motion.div>
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
					label="Staffing gaps (7d)"
					value={gaps.length}
					link="/dashboard/staffing"
				/>
				<StatCard
					label="Gaps today"
					value={gapsToday}
					link="/dashboard/staffing"
				/>
				<StatCard
					label="Missing phones (7d)"
					value={missing.length}
					link="/dashboard/staffing"
				/>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<StatCard
					label="Pending vacations"
					value={pendingVacations}
					link="/dashboard/vacations"
				/>
				<StatCard
					label="Upcoming assignments"
					value={upcomingAssignments.length}
					link="/dashboard/assignments"
				/>
				<StatCard
					label="Active tours"
					value={totalTours}
					link="/dashboard/tours"
				/>
				<StatCard
					label="Total customers"
					value={totalCustomers}
					link="/dashboard/customers"
				/>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
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

			{org?.slug && <PublicBookingLinkCard slug={org.slug} />}

			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<div>
						<CardTitle>Needs staffing</CardTitle>
						<CardDescription>
							{gaps.length === 0
								? "No open gaps in the next 7 days"
								: `${gaps.length} departure${gaps.length === 1 ? "" : "s"} need guides or fleet`}
						</CardDescription>
					</div>
					<Button asChild variant="outline" size="sm">
						<Link to="/dashboard/staffing">View all</Link>
					</Button>
				</CardHeader>
				<CardContent>
					{topGaps.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							All set — departures look fully staffed.
						</p>
					) : (
						<ul className="space-y-2">
							{topGaps.map((g) => (
								<li
									key={g.key}
									className="flex items-center justify-between border-b pb-2 last:border-0"
								>
									<div className="min-w-0 flex-1">
										<p className="font-medium truncate">{g.tourName}</p>
										<p className="text-muted-foreground text-xs">
											{g.date} · {g.startTime}
											{" · "}
											{g.gaps.join(", ")}
											{" · "}
											guides {g.guideCount}/{g.requiredGuides}
										</p>
									</div>
									<Button asChild size="sm" variant="outline">
										<Link
											to="/dashboard/assignments/new"
											search={{
												date: g.date,
												...(g.scheduleId
													? { scheduleId: g.scheduleId }
													: {}),
											}}
										>
											Assign
										</Link>
									</Button>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<div>
						<CardTitle>Missing phones</CardTitle>
						<CardDescription>
							{missing.length === 0
								? "Assigned staff in the next 7 days have phones on file"
								: `${missing.length} assigned staff won't get SMS until they add a phone`}
						</CardDescription>
					</div>
					<div className="flex flex-wrap gap-2">
						{missing.length > 0 ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={
									remindPending || remindStatus?.canSendManual === false
								}
								onClick={() => void onRemindPhones()}
								title={
									remindStatus && !remindStatus.orgBulkClear
										? "Org bulk cooldown — try again later"
										: remindStatus && remindStatus.eligibleCount === 0
											? "Everyone eligible was reminded in the last 7 days"
											: undefined
								}
							>
								{remindPending ? "Sending…" : "Remind all"}
							</Button>
						) : null}
						<Button asChild variant="outline" size="sm">
							<Link to="/dashboard/staffing">Staffing</Link>
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{topMissing.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No action needed — phones look complete for upcoming assignments.
						</p>
					) : (
						<ul className="space-y-2">
							{topMissing.map((p) => (
								<li
									key={p.userId}
									className="flex items-center justify-between border-b pb-2 last:border-0"
								>
									<div className="min-w-0 flex-1">
										<p className="font-medium truncate">{p.name}</p>
										<p className="text-muted-foreground text-xs">
											{p.roles.join(" · ")} · {p.assignmentCount} assignment
											{p.assignmentCount === 1 ? "" : "s"}
										</p>
									</div>
									<Button asChild size="sm" variant="outline">
										<Link
											to="/dashboard/guides/$userId"
											params={{ userId: p.userId }}
										>
											Add phone
										</Link>
									</Button>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Upcoming assignments</CardTitle>
					<CardDescription>
						Next {upcomingAssignments.length} scheduled assignments
					</CardDescription>
				</CardHeader>
				<CardContent>
					{upcomingAssignments.length === 0 ? (
						<div className="space-y-2">
							<p className="text-muted-foreground text-sm">
								No upcoming assignments.
							</p>
							<Button asChild variant="outline" size="sm">
								<Link to="/dashboard/assignments/new">+ Create assignment</Link>
							</Button>
						</div>
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
												{a.date} · {a.startTime}–{a.endTime} · Guide assigned
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

			<Card>
				<CardHeader>
					<CardTitle>Today's bookings</CardTitle>
					<CardDescription>
						{todaysBookings.length === 0
							? "No bookings scheduled for today"
							: `${todaysBookings.length} booking${todaysBookings.length === 1 ? "" : "s"} scheduled for today`}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{todaysBookings.length === 0 ? (
						<div className="space-y-2">
							<p className="text-muted-foreground text-sm">
								Share your public booking link to start receiving bookings.
							</p>
						</div>
					) : (
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
		<motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
			<Link
				to={link}
				className="block transition-colors hover:bg-muted rounded-md"
			>
				<MetricCard label={label} value={value} />
			</Link>
		</motion.div>
	);
}

function PublicBookingLinkCard({ slug }: { slug: string }) {
	const url =
		typeof window !== "undefined"
			? `${window.location.origin}/book/${slug}`
			: "";
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			toast.success("Link copied");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Could not copy — please copy manually");
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Public booking page</CardTitle>
				<CardDescription>
					Share this link with your customers — no account required to book.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex gap-2">
					<Input
						readOnly
						value={url}
						onClick={(e) => e.currentTarget.select()}
						className="font-mono text-xs"
						aria-label="Public booking URL"
					/>
					<Button onClick={handleCopy} disabled={!url} className="shrink-0">
						{copied ? "Copied!" : "Copy"}
					</Button>
					<Button variant="outline" asChild className="shrink-0">
						<Link to="/book/$slug" params={{ slug }}>
							Open
						</Link>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
