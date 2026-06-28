import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/assignments/$assignmentId")({
	component: AssignmentDetailPage,
});

function AssignmentDetailPage() {
	const { assignmentId } = Route.useParams();
	const { data: assignment, isPending, error } = useQuery(
		convexQuery(api.assignments.get, {
			assignmentId: assignmentId as Id<"assignments">,
		}),
	);
	const { data: tour } = useQuery(
		convexQuery(api.tours.get, {
			tourId: assignment?.tourId as Id<"tours">,
		}),
	);
	const { data: vehicle } = useQuery(
		convexQuery(api.vehicles.get, {
			vehicleId: assignment?.vehicleId as Id<"vehicles">,
		}),
	);
	const { data: driver } = useQuery(
		convexQuery(api.drivers.get, {
			driverId: assignment?.driverId as Id<"drivers">,
		}),
	);
	const complete = useMutation(api.assignments.complete);
	const cancel = useMutation(api.assignments.cancel);
	const remove = useMutation(api.assignments.remove);
	const [pending, setPending] = useState(false);

	const onComplete = async () => {
		setPending(true);
		try {
			await complete({ assignmentId: assignmentId as Id<"assignments"> });
			toast.success("Assignment marked complete");
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setPending(false);
		}
	};
	const onCancel = async () => {
		const reason = window.prompt("Reason for cancellation? (optional)") ?? "";
		setPending(true);
		try {
			await cancel({
				assignmentId: assignmentId as Id<"assignments">,
				reason: reason.trim() || undefined,
			});
			toast.success("Assignment cancelled");
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setPending(false);
		}
	};
	const onRemove = async () => {
		if (!window.confirm("Delete this assignment? This will soft-delete it.")) {
			return;
		}
		setPending(true);
		try {
			await remove({ assignmentId: assignmentId as Id<"assignments"> });
			toast.success("Assignment deleted");
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setPending(false);
		}
	};

	if (isPending) return <p className="text-muted-foreground">Loading…</p>;
	if (error) return <p className="text-destructive text-sm">Error: {error.message}</p>;
	if (!assignment) return <DetailPage title="Assignment not found" backTo="/dashboard/assignments" />;

	const endTimeDisplay = assignment.endTime ?? "—";
	const canComplete = assignment.status === "scheduled";
	const canCancel = assignment.status === "scheduled";
	const canDelete = assignment.status !== "completed";

	return (
		<DetailPage
			title={tour?.name ?? "Assignment"}
			subtitle={`${assignment.date} · ${assignment.startTime}–${endTimeDisplay}`}
			backTo="/dashboard/assignments"
			actions={
				<>
					{canComplete && (
						<Button onClick={onComplete} disabled={pending}>
							Mark complete
						</Button>
					)}
					{canCancel && (
						<Button variant="outline" onClick={onCancel} disabled={pending}>
							Cancel
						</Button>
					)}
					{canDelete && (
						<Button variant="destructive" onClick={onRemove} disabled={pending}>
							Delete
						</Button>
					)}
					{tour && (
						<Button asChild variant="outline">
							<Link to="/dashboard/tours/$tourId" params={{ tourId: tour._id }}>
								View tour
							</Link>
						</Button>
					)}
				</>
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
