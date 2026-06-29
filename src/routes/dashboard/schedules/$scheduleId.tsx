import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { DetailSkeleton } from "@/components/ui/skeleton";
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

function ScheduleDetailPage() {
	const { scheduleId } = Route.useParams();
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
		convexQuery(api.tours.get, {
			tourId: schedule?.tourId as Id<"tours">,
		}),
	);
	const { data: bookings, error: bookingsError } = useQuery(
		convexQuery(api.bookings.listBySchedule, {
			scheduleId: scheduleId as Id<"tourSchedules">,
		}),
	);

	if (isPending) {
		return <DetailSkeleton />;
	}
	if (error) return <ErrorBanner message={error.message} />;
	if (!schedule)
		return (
			<DetailPage title="Schedule not found" backTo="/dashboard/schedules" />
		);

	const utilization = schedule.capacityTotal
		? Math.round((schedule.capacityBooked / schedule.capacityTotal) * 100)
		: 0;

	const bookingRows = (bookings ?? []) as ScheduleBooking[];
	const bookingsErrorNode = bookingsError ? (
		<p className="text-muted-foreground text-sm">
			<span className="italic text-muted-foreground">(failed to load)</span>
		</p>
	) : null;

	const columns: DataTableColumn<ScheduleBooking>[] = [
		{
			key: "customer",
			header: "Customer",
			render: (b) => (
				<div>
					<p className="font-medium">{b.customerName || "(unknown)"}</p>
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
			title={tour?.name ?? "Tour schedule"}
			subtitle={`${schedule.date} · ${schedule.startTime}–${schedule.endTime}`}
			backTo="/dashboard/schedules"
			actions={
				tour ? (
					<Button asChild variant="outline">
						<Link to="/dashboard/tours/$tourId" params={{ tourId: tour._id }}>
							View tour
						</Link>
					</Button>
				) : undefined
			}
		>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="Date" value={schedule.date} />
				<MetricCard
					label="Time"
					value={`${schedule.startTime}–${schedule.endTime}`}
				/>
				<MetricCard
					label="Booked / Total"
					value={`${schedule.capacityBooked} / ${schedule.capacityTotal}`}
				/>
				<MetricCard label="Status" value={schedule.status}>
					<StatusBadge status={schedule.status} />
				</MetricCard>
			</div>

			<DetailSection
				title="Capacity utilization"
				description="How much of the schedule is booked"
			>
				<p className="text-3xl font-semibold">{utilization}%</p>
				<p className="text-muted-foreground text-sm">
					{schedule.capacityBooked} of {schedule.capacityTotal} spots booked
				</p>
			</DetailSection>

			<DetailSection
				title={`Bookings (${bookingRows.length})`}
				description="Active bookings assigned to this schedule"
			>
				{bookingsErrorNode ??
					(bookingRows.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No bookings yet for this schedule.
						</p>
					) : (
						<DataTable
							data={bookingRows}
							columns={columns}
							rowKey={(b) => b._id}
							emptyMessage="No bookings yet for this schedule."
						/>
					))}
			</DetailSection>

			{schedule.notes && (
				<DetailSection title="Notes">
					<p className="text-sm whitespace-pre-wrap">{schedule.notes}</p>
				</DetailSection>
			)}
		</DetailPage>
	);
}
