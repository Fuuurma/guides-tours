import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/schedules")({
	component: SchedulesPage,
});

const statusColors: Record<string, string> = {
	available: "bg-green-100 text-green-800",
	full: "bg-yellow-100 text-yellow-800",
	cancelled: "bg-gray-100 text-gray-800",
};

function SchedulesPage() {
	const { data: schedules, isPending } = useQuery(
		convexQuery(api.tourSchedules.list, {}),
	);

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Tour schedules</CardTitle>
					<CardDescription>
						{schedules?.length ?? 0} schedule
						{(schedules?.length ?? 0) === 1 ? "" : "s"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isPending ? (
						<p className="text-muted-foreground text-sm">Loading...</p>
					) : !schedules?.length ? (
						<p className="text-muted-foreground text-sm">
							No schedules yet. Schedules are concrete tour instances (date + time) that customers can book.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Date</TableHead>
									<TableHead>Time</TableHead>
									<TableHead>Booked</TableHead>
									<TableHead>Capacity</TableHead>
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{schedules.map((s) => (
									<TableRow key={s._id}>
										<TableCell>{s.date}</TableCell>
										<TableCell className="font-mono text-xs">
											{s.startTime}–{s.endTime}
										</TableCell>
										<TableCell>{s.capacityBooked}</TableCell>
										<TableCell>{s.capacityTotal}</TableCell>
										<TableCell>
											<Badge
												className={statusColors[s.status] ?? ""}
												variant="secondary"
											>
												{s.status}
											</Badge>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}