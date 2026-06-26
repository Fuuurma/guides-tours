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
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/assignments/$assignmentId")({
	component: AssignmentDetailPage,
});

const statusColors: Record<string, string> = {
	scheduled: "bg-blue-100 text-blue-800",
	completed: "bg-green-100 text-green-800",
	cancelled: "bg-gray-100 text-gray-800",
};

function AssignmentDetailPage() {
	const { assignmentId } = Route.useParams();
	const { data: assignment, isPending, error } = useQuery(
		convexQuery(api.assignments.get, { assignmentId: assignmentId as never }),
	);
	const { data: tour } = useQuery(
		convexQuery(api.tours.get, { tourId: assignment?.tourId as never }),
	);
	const { data: vehicle } = useQuery(
		convexQuery(api.vehicles.get, {
			vehicleId: assignment?.vehicleId as never,
		}),
	);
	const { data: driver } = useQuery(
		convexQuery(api.drivers.get, {
			driverId: assignment?.driverId as never,
		}),
	);

	if (isPending) {
		return <p className="text-muted-foreground">Loading...</p>;
	}
	if (error) {
		return (
			<p className="text-destructive text-sm">Error: {error.message}</p>
		);
	}
	if (!assignment) {
		return (
			<div className="space-y-4">
				<p className="text-muted-foreground">Assignment not found.</p>
				<Button asChild variant="outline">
					<Link to="/dashboard/assignments">← Back to assignments</Link>
				</Button>
			</div>
		);
	}

	const endTimeDisplay = assignment.endTime ?? "—";

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">
						{tour?.name ?? "Assignment"}
					</h1>
					<p className="text-muted-foreground text-sm">
						{assignment.date} · {assignment.startTime}–{endTimeDisplay}
					</p>
				</div>
				<div className="flex gap-2">
					{tour && (
						<Button asChild variant="outline">
							<Link
								to="/dashboard/tours/$tourId"
								params={{ tourId: tour._id }}
							>
								View tour
							</Link>
						</Button>
					)}
					<Button asChild variant="outline">
						<Link to="/dashboard/assignments">← Back</Link>
					</Button>
				</div>
			</header>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Metric label="Date" value={assignment.date} />
				<Metric
					label="Time"
					value={`${assignment.startTime}–${endTimeDisplay}`}
				/>
				<Metric label="Guide ID" value={assignment.guideId} mono />
				<Metric
					label="Status"
					customBadge={
						<Badge
							className={statusColors[assignment.status] ?? ""}
							variant="secondary"
						>
							{assignment.status}
						</Badge>
					}
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Resources</CardTitle>
					<CardDescription>Vehicle and driver (if assigned)</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<div className="flex items-baseline justify-between gap-4">
						<span className="text-muted-foreground">Vehicle</span>
						{vehicle ? (
							<Link
								to="/dashboard/vehicles/$vehicleId"
								params={{ vehicleId: vehicle._id }}
								className="text-blue-600 hover:underline"
							>
								{vehicle.name}
							</Link>
						) : (
							<span className="italic text-muted-foreground">Not assigned</span>
						)}
					</div>
					<div className="flex items-baseline justify-between gap-4">
						<span className="text-muted-foreground">Driver</span>
						{driver ? (
							<Link
								to="/dashboard/drivers/$driverId"
								params={{ driverId: driver._id }}
								className="font-mono text-xs text-blue-600 hover:underline"
							>
								{driver.userId}
							</Link>
						) : (
							<span className="italic text-muted-foreground">Not assigned</span>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function Metric({
	label,
	value,
	mono,
	customBadge,
}: {
	label: string;
	value?: string;
	mono?: boolean;
	customBadge?: React.ReactNode;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardDescription>{label}</CardDescription>
			</CardHeader>
			<CardContent>
				{customBadge ??
					(mono ? (
						<p className="font-mono text-xs">{value}</p>
					) : (
						<p className="text-2xl font-semibold">{value}</p>
					))}
			</CardContent>
		</Card>
	);
}
