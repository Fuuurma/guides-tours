import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import {
	AlertTriangle,
	CalendarDays,
	MapPin,
	PhoneOff,
	Plus,
	Sparkles,
	TrendingDown,
	TrendingUp,
	UserCheck,
	Users,
	Wallet,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useOrgMembers } from "@/hooks/use-org-members";
import { addDaysLocal, localYmd } from "@/lib/calendar-date";
import { formatCentsWhole, formatSignedPct } from "@/lib/format";
import { cn, getErrorMessage } from "@/lib/utils";
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
	// Tier 1: this-week vs last-week pulse. Backend derives the
	// previous window from `startDate` so we just pass the 7-day
	// rolling range. Default `sinceMs` of 24h is baked into the
	// count queries — pass nothing to use it.
	const { data: pulse, error: pulseError } = useQuery(
		convexQuery(api.analytics.getWeeklyPulse, {
			startDate: today,
			endDate: weekTo,
		}),
	);
	const { data: failedWebhookCount } = useQuery(
		convexQuery(api.webhookDeliveries.countFailedSince, {}),
	);
	const { data: failedPaymentCount } = useQuery(
		convexQuery(api.payments.countFailedSince, {}),
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
		missingPhoneError ??
		pulseError;

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

	// Tier 1: pulse deltas. Use `useMemo` so the strings don't
	// reallocate on every render — the values are derived from
	// `pulse` which is stable per query result.
	const pulseDeltas = useMemo(() => {
		if (!pulse) return null;
		const { bookings, guests, revenueCents, cancellationRate } = pulse;
		const {
			previousBookings,
			previousGuests,
			previousRevenueCents,
			previousCancellationRate,
		} = pulse;
		const pct = (now: number, before: number): number =>
			before === 0 ? (now > 0 ? 100 : 0) : ((now - before) / before) * 100;
		const revPct = pct(revenueCents, previousRevenueCents);
		const bookPct = pct(bookings, previousBookings);
		const guestPct = pct(guests, previousGuests);
		const cancelDelta = cancellationRate - previousCancellationRate;
		return {
			revPct,
			bookPct,
			guestPct,
			cancelDelta,
		};
	}, [pulse]);

	// Tier 3: needs-attention pill list. Compose from queries the
	// home page already issues, plus the two new count queries. A
	// zero-count pill is hidden — the operator only sees what
	// actually needs them today.
	const attentionItems = useMemo(() => {
		const items: Array<{
			key: string;
			label: string;
			count: number;
			to: string;
			icon: typeof AlertTriangle;
			tone: "warning" | "danger" | "info";
		}> = [];
		// Staffing gaps in the next 48h: re-filter the existing
		// 7-day staffingGaps result by a 48-hour window so this
		// pill is "right now" urgency, not "this week".
		const horizon = localYmd(addDaysLocal(new Date(), 2));
		const gaps48h = gaps.filter((g) => g.date >= today && g.date <= horizon);
		if (gaps48h.length > 0) {
			items.push({
				key: "gaps48h",
				label: "Staffing gaps in 48h",
				count: gaps48h.length,
				to: "/dashboard/staffing",
				icon: UserCheck,
				tone: "warning",
			});
		}
		const pendingCount = pendingBookingPage?.total ?? pendingBookings.length;
		if (pendingCount > 0) {
			items.push({
				key: "pendingBookings",
				label: "Pending bookings",
				count: pendingCount,
				to: "/dashboard/bookings",
				icon: Users,
				tone: "info",
			});
		}
		if (missing.length > 0) {
			items.push({
				key: "missingPhones",
				label: "Staff missing phones",
				count: missing.length,
				to: "/dashboard/staffing",
				icon: PhoneOff,
				tone: "warning",
			});
		}
		const wh = failedWebhookCount ?? 0;
		if (wh > 0) {
			items.push({
				key: "failedWebhooks",
				label: "Failed webhooks (24h)",
				count: wh,
				to: "/dashboard/ota",
				icon: AlertTriangle,
				tone: "danger",
			});
		}
		const fp = failedPaymentCount ?? 0;
		if (fp > 0) {
			items.push({
				key: "failedPayments",
				label: "Failed payments (24h)",
				count: fp,
				to: "/dashboard/payments",
				icon: Wallet,
				tone: "danger",
			});
		}
		return items;
	}, [
		gaps,
		today,
		pendingBookingPage,
		pendingBookings.length,
		missing.length,
		failedWebhookCount,
		failedPaymentCount,
	]);

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
					{/* Tier 1: weekly pulse row — this week vs last week.
					    Four hero numbers with delta arrows so the operator
					    can read momentum at a glance. Sand/coral palette
					    lives on these cards (border + ring on hover). */}
					<WeeklyPulseRow pulse={pulse} deltas={pulseDeltas} />

					{/* Tier 3: needs-attention row. Numbered pills with
					    counts — only shows the categories that have a
					    non-zero count. Hover nudges coral. */}
					{attentionItems.length > 0 ? (
						<NeedsAttentionRow items={attentionItems} />
					) : null}

					<div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
						<LinkedMetric
							label="Staffing gaps this week"
							value={gaps.length}
							to="/dashboard/staffing"
							description="Uncovered departures in the next 7 days. Assign crew before morning scramble."
							featured
						/>
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
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
						</div>
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
	description,
	featured = false,
}: {
	label: string;
	value: number | string;
	to: string;
	description?: string;
	featured?: boolean;
}) {
	return (
		<Link
			to={to}
			className={cn(
				"block rounded-xl border bg-card transition-colors hover:bg-muted/40",
				featured ? "p-6" : "p-5",
			)}
		>
			<p className="text-sm text-muted-foreground">{label}</p>
			<p
				className={cn(
					"mt-2 font-semibold tracking-tight tabular-nums",
					featured ? "text-4xl" : "text-2xl",
				)}
			>
				{value}
			</p>
			{description ? (
				<p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
					{description}
				</p>
			) : null}
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

/**
 * Tier 1: This-week vs last-week pulse row. Four hero numbers
 * (revenue, bookings, avg group size, cancellation rate) with
 * delta arrows so the operator reads momentum at a glance.
 *
 * Sand/coral palette lives on these cards (border + ring on
 * hover) to satisfy the design system's "ocean / sand / coral"
 * mandate while keeping the cards readable in both light and
 * dark mode.
 */
type PulseData = {
	startDate: string;
	endDate: string;
	previousStartDate: string;
	previousEndDate: string;
	revenueCents: number;
	bookings: number;
	guests: number;
	avgGroupSize: number;
	cancellationRate: number;
	previousRevenueCents: number;
	previousBookings: number;
	previousGuests: number;
	previousCancellationRate: number;
};

type PulseDeltas = {
	revPct: number;
	bookPct: number;
	guestPct: number;
	cancelDelta: number;
};

function WeeklyPulseRow({
	pulse,
	deltas,
}: {
	pulse: PulseData | undefined;
	deltas: PulseDeltas | null;
}) {
	return (
		<section
			aria-label="This week's performance"
			className="flex flex-col gap-3"
		>
			<header className="flex items-baseline justify-between gap-3">
				<h2 className="font-display text-xl font-medium tracking-tight">
					This week
				</h2>
				{pulse ? (
					<p className="font-mono text-xs text-muted-foreground">
						{pulse.startDate} → {pulse.endDate}
						{" vs "}
						{pulse.previousStartDate} → {pulse.previousEndDate}
					</p>
				) : (
					<Skeleton className="h-3 w-56" />
				)}
			</header>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<PulseMetric
					label="Revenue"
					value={pulse ? formatCentsWhole(pulse.revenueCents) : undefined}
					delta={
						deltas
							? {
									value: formatSignedPct(deltas.revPct, true),
									direction:
										deltas.revPct > 0
											? "up"
											: deltas.revPct < 0
												? "down"
												: "flat",
								}
							: null
					}
					icon={Wallet}
					href="/dashboard/analytics"
				/>
				<PulseMetric
					label="Bookings"
					value={pulse?.bookings}
					delta={
						deltas
							? {
									value: formatSignedPct(deltas.bookPct, true),
									direction:
										deltas.bookPct > 0
											? "up"
											: deltas.bookPct < 0
												? "down"
												: "flat",
								}
							: null
					}
					icon={CalendarDays}
					href="/dashboard/bookings"
				/>
				<PulseMetric
					label="Avg group"
					value={pulse ? pulse.avgGroupSize.toFixed(1) : undefined}
					delta={
						deltas
							? {
									value: formatSignedPct(deltas.guestPct, true),
									direction:
										deltas.guestPct > 0
											? "up"
											: deltas.guestPct < 0
												? "down"
												: "flat",
								}
							: null
					}
					icon={Users}
					href="/dashboard/bookings"
				/>
				<PulseMetric
					label="Cancellation rate"
					value={pulse ? `${pulse.cancellationRate}%` : undefined}
					delta={
						deltas
							? {
									// For cancellation rate, "up is bad" — invert the
									// direction so the arrow color matches the operator's
									// intent (red up arrow = worse).
									value: `${deltas.cancelDelta >= 0 ? "+" : ""}${deltas.cancelDelta.toFixed(1)}pp`,
									direction:
										deltas.cancelDelta > 0
											? "down"
											: deltas.cancelDelta < 0
												? "up"
												: "flat",
								}
							: null
					}
					icon={Sparkles}
					href="/dashboard/analytics"
				/>
			</div>
		</section>
	);
}

function PulseMetric({
	label,
	value,
	delta,
	icon: Icon,
	href,
}: {
	label: string;
	value: string | number | undefined;
	delta: { value: string; direction: "up" | "down" | "flat" } | null;
	icon: typeof Wallet;
	href: string;
}) {
	return (
		<Link
			to={href}
			className="group block rounded-xl border bg-card p-5 transition-colors hover:border-chart-1/50 hover:bg-chart-4/5"
		>
			<div className="flex items-start justify-between gap-3">
				<p className="text-sm text-muted-foreground">{label}</p>
				<Icon
					data-icon="inline-end"
					className="size-4 text-chart-1/70 group-hover:text-chart-1"
					aria-hidden="true"
				/>
			</div>
			<p className="mt-2 font-display text-3xl font-medium tracking-tight tabular-nums">
				{value ?? "—"}
			</p>
			{delta ? (
				<div className="mt-2 flex items-center gap-1.5 text-xs">
					{delta.direction === "up" ? (
						<TrendingUp
							className="size-3.5 text-emerald-600 dark:text-emerald-400"
							aria-hidden="true"
						/>
					) : delta.direction === "down" ? (
						<TrendingDown
							className="size-3.5 text-rose-600 dark:text-rose-400"
							aria-hidden="true"
						/>
					) : (
						<span
							className="size-1.5 rounded-full bg-muted-foreground/40"
							aria-hidden="true"
						/>
					)}
					<span
						className={cn(
							"tabular-nums",
							delta.direction === "up" &&
								"text-emerald-700 dark:text-emerald-300",
							delta.direction === "down" && "text-rose-700 dark:text-rose-300",
							delta.direction === "flat" && "text-muted-foreground",
						)}
					>
						{delta.value}
					</span>
					<span className="text-muted-foreground">vs last week</span>
				</div>
			) : null}
		</Link>
	);
}

/**
 * Tier 3: "Needs attention" pill row. Numbered list of categories
 * where the operator has outstanding work — only shows up if at
 * least one category has a non-zero count. Each pill links to the
 * page where the operator can resolve the issue.
 */
function NeedsAttentionRow({
	items,
}: {
	items: Array<{
		key: string;
		label: string;
		count: number;
		to: string;
		icon: typeof AlertTriangle;
		tone: "warning" | "danger" | "info";
	}>;
}) {
	return (
		<section aria-label="Needs attention" className="flex flex-col gap-3">
			<header className="flex items-baseline justify-between gap-3">
				<h2 className="font-display text-xl font-medium tracking-tight">
					Needs attention
				</h2>
				<p className="text-xs text-muted-foreground">
					{items.length} item{items.length === 1 ? "" : "s"}
				</p>
			</header>
			<ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{items.map((item) => {
					const Icon = item.icon;
					return (
						<li key={item.key}>
							<Link
								to={item.to}
								className={cn(
									"group flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors",
									item.tone === "danger" &&
										"border-destructive/30 hover:border-destructive/60 hover:bg-destructive/5",
									item.tone === "warning" &&
										"border-chart-4/40 hover:border-chart-4/70 hover:bg-chart-4/10",
									item.tone === "info" &&
										"hover:border-chart-1/50 hover:bg-chart-1/5",
								)}
							>
								<span
									className={cn(
										"flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
										item.tone === "danger" &&
											"bg-destructive/10 text-destructive",
										item.tone === "warning" && "bg-chart-4/15 text-chart-4",
										item.tone === "info" && "bg-chart-1/10 text-chart-1",
									)}
								>
									{item.count}
								</span>
								<div className="flex min-w-0 flex-1 items-center justify-between gap-2">
									<span className="truncate text-sm font-medium">
										{item.label}
									</span>
									<Icon
										className={cn(
											"size-4 shrink-0",
											item.tone === "danger" &&
												"text-destructive/70 group-hover:text-destructive",
											item.tone === "warning" &&
												"text-chart-4 group-hover:text-chart-4",
											item.tone === "info" &&
												"text-chart-1/70 group-hover:text-chart-1",
										)}
										aria-hidden="true"
									/>
								</div>
							</Link>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
