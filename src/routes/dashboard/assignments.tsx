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

export const Route = createFileRoute("/dashboard/assignments")({
	component: AssignmentsPage,
});

const statusColors: Record<string, string> = {
	scheduled: "bg-blue-100 text-blue-800",
	completed: "bg-green-100 text-green-800",
	cancelled: "bg-gray-100 text-gray-800",
};

function AssignmentsPage() {
	const { data: assignments, isPending } = useQuery(
		convexQuery(api.assignments.list, {}),
	);

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Assignments</CardTitle>
					<CardDescription>
						{assignments?.length ?? 0} assignment
						{(assignments?.length ?? 0) === 1 ? "" : "s"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isPending ? (
						<p className="text-muted-foreground text-sm">Loading...</p>
					) : !assignments?.length ? (
						<p className="text-muted-foreground text-sm">No assignments yet.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Date</TableHead>
									<TableHead>Time</TableHead>
									<TableHead>Guide</TableHead>
									<TableHead>Tour</TableHead>
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{assignments.map((a) => (
									<TableRow key={a._id}>
										<TableCell>{a.date}</TableCell>
										<TableCell className="font-mono text-xs">
											{a.startTime}–{a.endTime}
										</TableCell>
										<TableCell className="font-mono text-xs">
											{a.guideId}
										</TableCell>
										<TableCell className="font-mono text-xs">
											{a.tourId}
										</TableCell>
										<TableCell>
											<Badge
												className={statusColors[a.status] ?? ""}
												variant="secondary"
											>
												{a.status}
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