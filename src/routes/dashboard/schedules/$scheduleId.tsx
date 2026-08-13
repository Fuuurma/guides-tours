import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { ErrorBanner } from "@/components/ui/error-banner";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useOrgMembers } from "@/hooks/use-org-members";
import { evaluateSlotStaffing, resolveTourStaffing } from "@/lib/staffing";
import { getErrorMessage, getSafeDisplayMessage } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/schedules/$scheduleId")({
	component: ScheduleDetailPage,
});

interface ScheduleBooking {
	_id: Id<"bookings">;
	date: string;
	startTime: string;
	guests: number;
	customerName: string;
	customerEmail: string;
	status: "pending" | "confirmed" | "checked_in" | "completed" | "cancelled";
}

type AssignmentLite = {
	_id: Id<"assignments">;
	guideId: string;
	startTime: string;
	status: string;
	vehicleId?: Id<"vehicles">;
	driverId?: Id<"drivers">;
	scheduleId?: Id<"tourSchedules">;
};

function ScheduleDetailPage() {
	const { scheduleId } = Route.useParams();
	const navigate = useNavigate();
	const {
		data: schedule,
		isPending,
		error,
	} = useQuery(
		convexQuery(api.tourSchedules.get, {
			scheduleId: scheduleId as Id<"tourSchedules">,
		}),
	);
	const { data: tour } = useQuery(
		convexQuery(
			api.tours.get,
			schedule?.tourId ? { tourId: schedule.tourId } : "skip",
		),
	);
	const { data: bookings, error: bookingsError } = useQuery(
		convexQuery(api.bookings.listBySchedule, {
			scheduleId: scheduleId as Id<"tourSchedules">,
		}),
	);
	const { data: assignments } = useQuery(
		convexQuery(
			api.assignments.list,
			schedule
				? {
						tourId: schedule.tourId,
						dateFrom: schedule.date,
						dateTo: schedule.date,
					}
				: "skip",
		),
	);
	const { displayName } = useOrgMembers(["guide", "owner", "admin"]);
	const updateSchedule = useMutation(api.tourSchedules.update);
	const removeSchedule = useMutation(api.tourSchedules.remove);
	const confirm = useConfirm();
	const [pending, setPending] = useState<"cancel" | "delete" | null>(null);

	const crew = useMemo(() => {
		if (!schedule) return [] as AssignmentLite[];
		return ((assignments ?? []) as AssignmentLite[]).filter((a) => {
			if (a.status === "cancelled") return false;
			if (a.startTime !== schedule.startTime) return false;
			if (a.scheduleId && a.scheduleId !== schedule._id) return false;
			return true;
		});
	}, [assignments, schedule]);

	if (isPending) {
		return <DetailSkeleton />;
	}
	if (error) return <ErrorBanner message={getSafeDisplayMessage(error)} />;
	if (!schedule)
		return (
			<DetailPage title="Schedule not found" backTo="/dashboard/schedules" />
		);

	const utilization = schedule.capacityTotal
		? Math.round((schedule.capacityBooked / schedule.capacityTotal) * 100)
		: 0;
	const seatsRemaining = Math.max(
		schedule.capacityTotal - schedule.capacityBooked,
		0,
	);
	const canAddBookings = schedule.status === "available" && seatsRemaining > 0;
	const canAssign = schedule.status !== "cancelled";

	const staffing = tour
		? resolveTourStaffing({
				tourType: tour.tourType,
				requiredGuides: tour.requiredGuides,
				requiresVehicle: tour.requiresVehicle,
				requiresDriver: tour.requiresDriver,
				requiredVehicleType: tour.requiredVehicleType,
			})
		: null;
	const slotEval = staffing
		? evaluateSlotStaffing({
				requiredGuides: staffing.requiredGuides,
				requiresVehicle: staffing.requiresVehicle,
				requiresDriver: staffing.requiresDriver,
				guideCount: crew.length,
				hasVehicle: crew.some((a) => a.vehicleId),
				hasDriver: crew.some((a) => a.driverId),
			})
		: null;

	const bookingRows = (bookings ?? []) as ScheduleBooking[];

	const onCancelSchedule = async () => {
		const ok = await confirm({
			title: "Cancel this departure?",
			description:
				schedule.capacityBooked > 0
					? `This departure has ${schedule.capacityBooked} booked guest(s). Cancel those bookings first, then cancel the departure.`
					: "New bookings will be blocked. Assigned crew is not removed.",
			confirmText: "Cancel departure",
			variant: "destructive",
		});
		if (!ok) {
			return;
		}
		setPending("cancel");
		try {
			await updateSchedule({
				scheduleId: schedule._id,
				status: "cancelled",
			});
			toast.success("Departure cancelled");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(null);
		}
	};

	const onDeleteSchedule = async () => {
		const ok = await confirm({
			title: "Permanently delete this departure?",
			description: "Only allowed when no bookings are linked.",
			variant: "destructive",
		});
		if (!ok) {
			return;
		}
		setPending("delete");
		try {
			await removeSchedule({ scheduleId: schedule._id });
			toast.success("Departure deleted");
			void navigate({ to: "/dashboard/schedules" });
		} catch (err) {
			toast.error(getErrorMessage(err));
			setPending(null);
		}
	};

	const columns: DataTableColumn<ScheduleBooking>[] = [
		{
			key: "customer",
			header: "Guest",
			render: (b) => (
				<div>
					<p className="font-medium">{b.customerName || "Unknown guest"}</p>
					<p className="text-muted-foreground text-xs">{b.customerEmail}</p>
				</div>
			),
			searchValue: (b) => `${b.customerName} ${b.customerEmail}`,
		},
		{ key: "time", header: "Time", render: (b) => b.startTime },
		{ key: "guests", header: "Guests", render: (b) => b.guests },
		{
			key: "status",
			header: "Status",
			render: (b) => <StatusBadge status={b.status} />,
			searchValue: (b) => b.status,
		},
	];

	return (
		<DetailPage
			title={tour?.name ?? "Departure"}
			subtitle={`${schedule.date} · ${schedule.startTime}–${schedule.endTime}`}
			backTo="/dashboard/schedules"
			actions={
				<div className="flex flex-wrap gap-2">
					{canAssign && (
						<>
							<Button asChild>
								<Link
									to="/dashboard/assignments/new"
									search={{ scheduleId, date: schedule.date }}
								>
									Assign guide
								</Link>
							</Button>
							{canAddBookings ? (
								<Button asChild variant="outline">
									<Link to="/dashboard/bookings/new" search={{ scheduleId }}>
										+ Book guests
									</Link>
								</Button>
							) : (
								<Button disabled variant="outline">
									Full
								</Button>
							)}
							<Button
								variant="destructive"
								disabled={pending !== null || schedule.capacityBooked > 0}
								title={
									schedule.capacityBooked > 0
										? "Cancel the bookings on this departure first"
										: undefined
								}
								onClick={() => void onCancelSchedule()}
							>
								{pending === "cancel" ? (
									<Spinner data-icon="inline-start" />
								) : null}
								{pending === "cancel" ? "Cancelling…" : "Cancel schedule"}
							</Button>
						</>
					)}
					{schedule.capacityBooked === 0 && (
						<Button
							variant="outline"
							disabled={pending !== null}
							onClick={() => void onDeleteSchedule()}
						>
							{pending === "delete" ? (
								<Spinner data-icon="inline-start" />
							) : null}
							{pending === "delete" ? "Deleting…" : "Delete"}
						</Button>
					)}
					{tour ? (
						<Button asChild variant="ghost">
							<Link to="/dashboard/tours/$tourId" params={{ tourId: tour._id }}>
								View tour
							</Link>
						</Button>
					) : null}
				</div>
			}
		>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
				<MetricCard label="Date" value={schedule.date} />
				<MetricCard
					label="Time"
					value={`${schedule.startTime}–${schedule.endTime}`}
				/>
				<MetricCard
					label="Booked / Total"
					value={`${schedule.capacityBooked} / ${schedule.capacityTotal}`}
				/>
				<MetricCard label="Seats left" value={seatsRemaining} />
				<MetricCard label="Status" value={schedule.status}>
					<StatusBadge status={schedule.status} />
				</MetricCard>
			</div>

			{slotEval && !slotEval.ready ? (
				<Alert variant="destructive">
					<AlertTitle>This departure is not staffed</AlertTitle>
					<AlertDescription>
						Still needs {slotEval.gaps.join(", ")}. Assign crew before the start
						time.
					</AlertDescription>
				</Alert>
			) : null}

			<DetailSection
				title="Crew"
				description={
					slotEval?.ready
						? "This departure is fully staffed"
						: staffing
							? `Needs ${staffing.requiredGuides} guide${staffing.requiredGuides === 1 ? "" : "s"}${staffing.requiresVehicle ? " · vehicle" : ""}${staffing.requiresDriver ? " · driver" : ""}`
							: "Who is running this departure"
				}
				actions={
					canAssign && crew.length > 0 ? (
						<Button asChild size="sm">
							<Link
								to="/dashboard/assignments/new"
								search={{ scheduleId, date: schedule.date }}
							>
								Assign another
							</Link>
						</Button>
					) : null
				}
			>
				{crew.length === 0 ? (
					<Empty className="min-h-0 border-dashed p-6 md:p-8">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Users />
							</EmptyMedia>
							<EmptyTitle>No one assigned</EmptyTitle>
							<EmptyDescription>
								Publish is only half the job. Assign a guide
								{staffing?.requiresVehicle ? ", vehicle" : ""}
								{staffing?.requiresDriver ? ", and driver" : ""} for this
								departure.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<ul className="flex flex-col gap-2">
						{crew.map((a) => (
							<li
								key={a._id}
								className="flex flex-wrap items-center justify-between gap-2 text-sm"
							>
								<Link
									to="/dashboard/assignments/$assignmentId"
									params={{ assignmentId: a._id }}
									className="text-link hover:underline"
								>
									{displayName(a.guideId)}
								</Link>
								<span className="text-muted-foreground">
									{a.status}
									{a.vehicleId ? " · vehicle" : ""}
									{a.driverId ? " · driver" : ""}
								</span>
							</li>
						))}
					</ul>
				)}
			</DetailSection>

			<DetailSection
				title="Capacity"
				description={`${utilization}% of seats are booked`}
			>
				<p className="text-3xl font-semibold">{utilization}%</p>
				<p className="text-muted-foreground text-sm">
					{seatsRemaining > 0
						? `${seatsRemaining} seat${seatsRemaining === 1 ? "" : "s"} remaining`
						: "This departure is full — new bookings are blocked."}
				</p>
			</DetailSection>

			<DetailSection
				title={`Guests (${bookingRows.length})`}
				description="Direct and operator bookings on this departure"
			>
				{bookingsError ? (
					<Alert variant="destructive">
						<AlertTitle>Could not load bookings</AlertTitle>
						<AlertDescription>
							{getSafeDisplayMessage(bookingsError)}
						</AlertDescription>
					</Alert>
				) : bookingRows.length === 0 ? (
					<Empty className="min-h-0 border-dashed p-6 md:p-8">
						<EmptyHeader>
							<EmptyTitle>No guests yet</EmptyTitle>
							<EmptyDescription>
								Crew can still be assigned. Add a walk-up booking or share the
								direct booking link.
							</EmptyDescription>
						</EmptyHeader>
						{canAddBookings ? (
							<EmptyContent>
								<Button asChild size="sm" variant="outline">
									<Link to="/dashboard/bookings/new" search={{ scheduleId }}>
										+ Book guests
									</Link>
								</Button>
							</EmptyContent>
						) : null}
					</Empty>
				) : (
					<DataTable
						data={bookingRows}
						columns={columns}
						rowKey={(b) => b._id}
						emptyMessage="No guests yet on this departure."
					/>
				)}
			</DetailSection>

			{schedule.notes && (
				<DetailSection title="Notes">
					<p className="text-sm whitespace-pre-wrap">{schedule.notes}</p>
				</DetailSection>
			)}
		</DetailPage>
	);
}
