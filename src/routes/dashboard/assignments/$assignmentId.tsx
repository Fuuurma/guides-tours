import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/assignments/$assignmentId")({
	component: AssignmentDetailPage,
});

function AssignmentDetailPage() {
	const { assignmentId } = Route.useParams();
	const { data: assignment, isPending, error } = useQuery(
		convexQuery(api.assignments.get, { assignmentId: assignmentId as never }),
	);
	const { data: tour } = useQuery(
		convexQuery(api.tours.get, { tourId: assignment?.tourId as never }),
	);
	const { data: vehicle } = useQuery(
		convexQuery(api.vehicles.get, { vehicleId: assignment?.vehicleId as never }),
	);
	const { data: driver } = useQuery(
		convexQuery(api.drivers.get, { driverId: assignment?.driverId as never }),
	);

	if (isPending) return <p className="text-muted-foreground">Loading…</p>;
	if (error) return <p className="text-destructive text-sm">Error: {error.message}</p>;
	if (!assignment) return <DetailPage title="Assignment not found" backTo="/dashboard/assignments" />;

	const endTimeDisplay = assignment.endTime ?? "—";

	return (
		<DetailPage
			title={tour?.name ?? "Assignment"}
			subtitle={`${assignment.date} · ${assignment.startTime}–${endTimeDisplay}`}
			backTo="/dashboard/assignments"
			actions={
				tour ? (
					<Link to="/dashboard/tours/$tourId" params={{ tourId: tour._id }} className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
						View tour
					</Link>
				) : undefined
			}
		>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="Date" value={assignment.date} />
				<MetricCard label="Time" value={`${assignment.startTime}–${endTimeDisplay}`} />
				<MetricCard label="Guide ID" value={assignment.guideId} />
				<MetricCard label="Status" value={assignment.status}>
					<StatusBadge status={assignment.status} />
				</MetricCard>
			</div>

			<DetailSection title="Resources" description="Vehicle and driver (if assigned)">
				<DetailRow
					label="Vehicle"
					value={vehicle ? (
						<Link to="/dashboard/vehicles/$vehicleId" params={{ vehicleId: vehicle._id }} className="text-blue-600 hover:underline">
							{vehicle.name}
						</Link>
					) : (
						<span className="italic text-muted-foreground">Not assigned</span>
					)}
				/>
				<DetailRow
					label="Driver"
					value={driver ? (
						<Link to="/dashboard/drivers/$driverId" params={{ driverId: driver._id }} className="font-mono text-xs text-blue-600 hover:underline">
							{driver.userId}
						</Link>
					) : (
						<span className="italic text-muted-foreground">Not assigned</span>
					)}
				/>
			</DetailSection>
		</DetailPage>
	);
}
