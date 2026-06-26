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

export const Route = createFileRoute("/dashboard/schedules/$scheduleId")({
	component: ScheduleDetailPage,
});

const statusColors: Record<string, string> = {
	available: "bg-green-100 text-green-800",
	full: "bg-yellow-100 text-yellow-800",
	cancelled: "bg-gray-100 text-gray-800",
};

function ScheduleDetailPage() {
	const { scheduleId } = Route.useParams();
	const { data: schedule, isPending, error } = useQuery(
		convexQuery(api.tourSchedules.get, { scheduleId: scheduleId as never }),
	);
	const { data: tour } = useQuery(
		convexQuery(api.tours.get, { tourId: schedule?.tourId as never }),
	);

	if (isPending) {
		return <p className="text-muted-foreground">Loading...</p>;
	}
	if (error) {
		return (
			<p className="text-destructive text-sm">Error: {error.message}</p>
		);
	}
	if (!schedule) {
		return (
			<div className="space-y-4">
				<p className="text-muted-foreground">Schedule not found.</p>
				<Button asChild variant="outline">
					<Link to="/dashboard/schedules">← Back to schedules</Link>
				</Button>
			</div>
		);
	}

	const utilization = schedule.capacityTotal
		? Math.round((schedule.capacityBooked / schedule.capacityTotal) * 100)
		: 0;

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">
						{tour?.name ?? "Tour schedule"}
					</h1>
					<p className="text-muted-foreground text-sm">
						{schedule.date} · {schedule.startTime}–{schedule.endTime}
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
						<Link to="/dashboard/schedules">← Back</Link>
					</Button>
				</div>
			</header>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Metric label="Date" value={schedule.date} />
				<Metric
					label="Time"
					value={`${schedule.startTime}–${schedule.endTime}`}
				/>
				<Metric
					label="Booked / Total"
					value={`${schedule.capacityBooked} / ${schedule.capacityTotal}`}
				/>
				<Metric
					label="Status"
					customBadge={
						<Badge
							className={statusColors[schedule.status] ?? ""}
							variant="secondary"
						>
							{schedule.status}
						</Badge>
					}
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Capacity utilization</CardTitle>
					<CardDescription>
						How much of the schedule is booked
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-3xl font-semibold">{utilization}%</p>
					<p className="text-muted-foreground text-sm">
						{schedule.capacityBooked} of {schedule.capacityTotal} spots booked
					</p>
				</CardContent>
			</Card>

			{schedule.notes && (
				<Card>
					<CardHeader>
						<CardTitle>Notes</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm whitespace-pre-wrap">{schedule.notes}</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function Metric({
	label,
	value,
	customBadge,
}: {
	label: string;
	value?: string;
	customBadge?: React.ReactNode;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardDescription>{label}</CardDescription>
			</CardHeader>
			<CardContent>
				{customBadge ?? <p className="text-2xl font-semibold">{value}</p>}
			</CardContent>
		</Card>
	);
}
