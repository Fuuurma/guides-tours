import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { CalendarDays, MapPin, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useOrgMembers } from "@/hooks/use-org-members";
import { addDaysLocal, localYmd } from "@/lib/calendar-date";
import { formatCentsWhole } from "@/lib/format";
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
		convexQuery(api.bookings.list, { dateFrom: today, dateTo: today }),
	);
	const { data: pendingBookingPage, error: pendingBookingsError } = useQuery(
		convexQuery(api.bookings.list, {
			status: "pending",
			sortBy: "createdAt",
			sortOrder: "asc",
			pageSize: 5,
		}),
	);
	const { data: assignments, error: assignmentsError } = useQuery(
		convexQuery(api.assignments.list, { dateFrom: today }),
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
	const { displayName } = useOrgMembers();

	const sendPhoneReminders = useMutation(api.phoneReminders.sendReminders);
	const [remindPending, setRemindPending] = useState(false);

	const firstError =
		bookingsError ??
		pendingBookingsError ??
		assignmentsError ??
		customersError ??
		toursError ??
		staffingError ??
		missingPhoneError;

	const tourNameById = new Map<string, string>(
		(tours ?? []).map((t) => [String(t._id), t.name]),
	);
	const customerNameById = new Map<string, string>(
		(customers?.items ?? []).map((c) => [String(c._id), c.name]),
	);

	const todaysBookings = (bookings?.items ?? []).filter(
		(b) => b.date === today,
	);
	const pendingBookings = pendingBookingPage?.items ?? [];
	const todaysAssignments = (assignments ?? [])
		.filter((a) => a.status === "scheduled" && a.date === today)
		.sort((a, b) => a.startTime.localeCompare(b.startTime));
	const nextAssignments = (assignments ?? [])
		.filter((a) => a.status === "scheduled" && a.date > today)
		.sort((a, b) =>
			a.date === b.date
				? a.startTime.localeCompare(b.startTime)
				: a.date.localeCompare(b.date),
		)
		.slice(0, 4);
	const totalTours = (tours ?? []).filter((t) => t.isActive).length;
	const gaps = staffingGaps ?? [];
	const topGaps = gaps.slice(0, 5);
	const missing = missingPhones ?? [];
	const topMissing = missing.slice(0, 5);
	const isFirstRun =
		totalTours === 0 &&
		todaysBookings.length === 0 &&
		pendingBookings.length === 0;

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
		<div className="flex flex-col gap-6">
			{firstError && (
				<ErrorBanner
					message={`Some data failed to load: ${firstError.message}`}
					hint="Cards below may show stale or empty data. Refresh to retry."
				/>
			)}
			<header className="flex flex-wrap items-start justify-between gap-4">
				<motion.div
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.25, ease: "easeOut" }}
				>
					<h1 className="text-2xl font-semibold tracking-tight">Today</h1>
					<p className="mt-0.5 text-sm text-muted-foreground">
						{new Date().toLocaleDateString(undefined, {
							weekday: "long",
							month: "long",
							day: "numeric",
						})}
						{" · "}
						{org?.name ?? "your workspace"}
					</p>
				</motion.div>
				<div className="flex flex-wrap gap-2">
					<Button asChild>
						<Link to="/dashboard/assignments/new">
							<Plus data-icon="inline-start" /> Assign
						</Link>
					</Button>
					<Button asChild variant="outline">
						<Link to="/dashboard/schedules/new">New schedule</Link>
					</Button>
				</div>
			</header>

			{isFirstRun ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<MapPin />
						</EmptyMedia>
						<EmptyTitle>Set up your first tour</EmptyTitle>
						<EmptyDescription>
							Create a tour, publish departures on the calendar, then assign
							guides and vehicles. Direct booking is a channel you can share
							later.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<div className="flex flex-wrap justify-center gap-2">
							<Button asChild>
								<Link to="/dashboard/tours/new">Create a tour</Link>
							</Button>
							<Button asChild variant="outline">
								<Link to="/dashboard/schedules/new">Add a schedule</Link>
							</Button>
						</div>
					</EmptyContent>
				</Empty>
			) : (
				<>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<LinkedMetric
							label="Staffing gaps (7d)"
							value={gaps.length}
							to="/dashboard/staffing"
						/>
						<LinkedMetric
							label="Bookings today"
							value={todaysBookings.length}
							to="/dashboard/bookings"
						/>
						<LinkedMetric
							label="Pending requests"
							value={pendingBookingPage?.total ?? pendingBookings.length}
							to="/dashboard/bookings"
						/>
						<LinkedMetric
							label="Active tours"
							value={totalTours}
							to="/dashboard/tours"
						/>
					</div>

					{org?.slug ? <PublicBookingLinkBar slug={org.slug} /> : null}

					<div className="grid gap-4 lg:grid-cols-2">
						<Card>
							<CardHeader className="flex flex-row items-start justify-between gap-3">
								<div className="min-w-0">
									<CardTitle>Needs confirmation</CardTitle>
									<CardDescription>
										{pendingBookings.length === 0
											? "Walk-in and channel requests wait here until you confirm them."
											: `${pendingBookingPage?.total ?? pendingBookings.length} request${(pendingBookingPage?.total ?? pendingBookings.length) === 1 ? "" : "s"} waiting`}
									</CardDescription>
								</div>
								<Button asChild variant="outline" size="sm">
									<Link to="/dashboard/bookings">Bookings</Link>
								</Button>
							</CardHeader>
							<CardContent>
								{pendingBookings.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										Nothing needs confirmation right now.
									</p>
								) : (
									<ul className="flex flex-col gap-2">
										{pendingBookings.map((booking) => (
											<li
												key={booking._id}
												className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
											>
												<div className="min-w-0 flex-1">
													<p className="truncate font-medium">
														{customerNameById.get(String(booking.customerId)) ??
															"Customer request"}
													</p>
													<p className="text-xs text-muted-foreground">
														{tourNameById.get(String(booking.tourId)) ??
															"Tour request"}
														{" · "}
														{booking.date} at {booking.startTime}
														{" · "}
														{booking.guests} guest
														{booking.guests === 1 ? "" : "s"}
													</p>
												</div>
												<Button asChild size="sm" variant="outline">
													<Link
														to="/dashboard/bookings/$bookingId"
														params={{ bookingId: booking._id }}
													>
														Review
													</Link>
												</Button>
											</li>
										))}
									</ul>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="flex flex-row items-start justify-between gap-3">
								<div className="min-w-0">
									<CardTitle>Needs staffing</CardTitle>
									<CardDescription>
										{gaps.length === 0
											? "No open gaps in the next 7 days"
											: `${gaps.length} departure${gaps.length === 1 ? "" : "s"} need guides or fleet`}
									</CardDescription>
								</div>
								<Button asChild variant="outline" size="sm">
									<Link to="/dashboard/staffing">Staffing</Link>
								</Button>
							</CardHeader>
							<CardContent>
								{topGaps.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										Departures look fully staffed.
									</p>
								) : (
									<ul className="flex flex-col gap-2">
										{topGaps.map((g) => (
											<li
												key={g.key}
												className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
											>
												<div className="min-w-0 flex-1">
													<p className="truncate font-medium">{g.tourName}</p>
													<p className="text-xs text-muted-foreground">
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
					</div>

					<div className="grid gap-4 lg:grid-cols-2">
						<Card>
							<CardHeader>
								<CardTitle>Today&apos;s bookings</CardTitle>
								<CardDescription>
									{todaysBookings.length === 0
										? "No guests on the books for today"
										: `${todaysBookings.length} booking${todaysBookings.length === 1 ? "" : "s"} today`}
								</CardDescription>
							</CardHeader>
							<CardContent>
								{todaysBookings.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										Share the direct booking link, or add a booking a guest made
										by phone.
									</p>
								) : (
									<ul className="flex flex-col gap-2">
										{todaysBookings.slice(0, 6).map((b) => {
											const tourName = tourNameById.get(String(b.tourId));
											const customerName = b.customerId
												? customerNameById.get(String(b.customerId))
												: null;
											return (
												<li
													key={b._id}
													className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
												>
													<div className="min-w-0 flex-1">
														<p className="truncate font-medium">
															{customerName ?? tourName ?? (
																<span className="italic text-muted-foreground">
																	Unknown booking
																</span>
															)}
														</p>
														<p className="text-xs text-muted-foreground">
															{b.startTime}
															{tourName ? ` · ${tourName}` : ""}
															{" · "}
															{b.guests} guest
															{b.guests === 1 ? "" : "s"}
															{" · "}
															{formatCentsWhole(b.totalAmountCents)}
														</p>
													</div>
													<div className="flex shrink-0 items-center gap-2">
														<StatusBadge status={b.status} />
														<Button asChild size="sm" variant="ghost">
															<Link
																to="/dashboard/bookings/$bookingId"
																params={{
																	bookingId: b._id as Id<"bookings">,
																}}
															>
																Open
															</Link>
														</Button>
													</div>
												</li>
											);
										})}
									</ul>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Today&apos;s assignments</CardTitle>
								<CardDescription>
									{todaysAssignments.length === 0
										? "No scheduled guides for today"
										: `${todaysAssignments.length} assignment${todaysAssignments.length === 1 ? "" : "s"} on the board`}
								</CardDescription>
							</CardHeader>
							<CardContent>
								{todaysAssignments.length === 0 ? (
									<div className="flex flex-col gap-3">
										{nextAssignments.length === 0 ? (
											<p className="text-sm text-muted-foreground">
												Nothing scheduled. Assign a guide when a departure is
												staffed.
											</p>
										) : (
											<>
												<p className="text-sm text-muted-foreground">
													Nothing today. Next up:
												</p>
												<ul className="flex flex-col gap-2">
													{nextAssignments.map((a) => (
														<AssignmentRow
															key={a._id}
															assignmentId={a._id as Id<"assignments">}
															tourId={a.tourId}
															tourName={tourNameById.get(String(a.tourId))}
															guideName={displayName(a.guideId)}
															when={`${a.date} · ${a.startTime}–${a.endTime}`}
														/>
													))}
												</ul>
											</>
										)}
										<Button asChild variant="outline" size="sm">
											<Link to="/dashboard/assignments/new">
												Create assignment
											</Link>
										</Button>
									</div>
								) : (
									<ul className="flex flex-col gap-2">
										{todaysAssignments.map((a) => (
											<AssignmentRow
												key={a._id}
												assignmentId={a._id as Id<"assignments">}
												tourId={a.tourId}
												tourName={tourNameById.get(String(a.tourId))}
												guideName={displayName(a.guideId)}
												when={`${a.startTime}–${a.endTime}`}
											/>
										))}
									</ul>
								)}
							</CardContent>
						</Card>
					</div>

					{missing.length > 0 ? (
						<Card>
							<CardHeader className="flex flex-row items-start justify-between gap-3">
								<div className="min-w-0">
									<CardTitle>Missing phones</CardTitle>
									<CardDescription>
										{missing.length} assigned staff won&apos;t get SMS until
										they add a phone
									</CardDescription>
								</div>
								<div className="flex flex-wrap gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={
											remindPending || remindStatus?.canSendManual === false
										}
										onClick={() => void onRemindPhones()}
									>
										{remindPending ? (
											<Spinner data-icon="inline-start" />
										) : null}
										{remindPending ? "Sending…" : "Remind all"}
									</Button>
									<Button asChild variant="outline" size="sm">
										<Link to="/dashboard/staffing">Staffing</Link>
									</Button>
								</div>
							</CardHeader>
							<CardContent>
								<ul className="flex flex-col gap-2">
									{topMissing.map((p) => (
										<li
											key={p.userId}
											className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
										>
											<div className="min-w-0 flex-1">
												<p className="truncate font-medium">{p.name}</p>
												<p className="text-xs text-muted-foreground">
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
							</CardContent>
						</Card>
					) : null}
				</>
			)}
		</div>
	);
}

function LinkedMetric({
	label,
	value,
	to,
}: {
	label: string;
	value: number | string;
	to: string;
}) {
	return (
		<Link
			to={to}
			className="block rounded-xl border bg-card p-5 transition-colors hover:bg-muted/40"
		>
			<p className="text-sm text-muted-foreground">{label}</p>
			<p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
				{value}
			</p>
		</Link>
	);
}

function AssignmentRow({
	assignmentId,
	tourId,
	tourName,
	guideName,
	when,
}: {
	assignmentId: Id<"assignments">;
	tourId: string;
	tourName: string | undefined;
	guideName: string;
	when: string;
}) {
	return (
		<li className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium">
					{tourName ? (
						<Link
							to="/dashboard/tours/$tourId"
							params={{ tourId: tourId as Id<"tours"> }}
							className="hover:underline"
						>
							{tourName}
						</Link>
					) : (
						<span className="italic text-muted-foreground">Unknown tour</span>
					)}
				</p>
				<p className="text-xs text-muted-foreground">
					{when} · {guideName}
				</p>
			</div>
			<Button asChild size="sm" variant="ghost">
				<Link
					to="/dashboard/assignments/$assignmentId"
					params={{ assignmentId }}
				>
					Open
				</Link>
			</Button>
		</li>
	);
}

function PublicBookingLinkBar({ slug }: { slug: string }) {
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
		<div className="flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
			<div className="flex min-w-0 items-center gap-2 text-sm">
				<CalendarDays className="size-4 shrink-0 text-muted-foreground" />
				<span className="shrink-0 font-medium">Direct booking link</span>
			</div>
			<Input
				readOnly
				value={url}
				onClick={(e) => e.currentTarget.select()}
				className="min-w-0 font-mono text-xs"
				aria-label="Direct booking URL"
			/>
			<div className="flex shrink-0 gap-2">
				<Button onClick={handleCopy} disabled={!url} size="sm">
					{copied ? "Copied" : "Copy"}
				</Button>
				<Button variant="outline" asChild size="sm">
					<Link to="/book/$slug" params={{ slug }}>
						Open
					</Link>
				</Button>
			</div>
		</div>
	);
}
