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

export const Route = createFileRoute("/dashboard/vacations")({
	component: VacationsPage,
});

const statusColors: Record<string, string> = {
	pending: "bg-yellow-100 text-yellow-800",
	approved: "bg-green-100 text-green-800",
	rejected: "bg-red-100 text-red-800",
};

function VacationsPage() {
	const { data: vacations, isPending } = useQuery(
		convexQuery(api.vacationRequests.list, {}),
	);

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Vacation requests</CardTitle>
					<CardDescription>
						{vacations?.length ?? 0} request
						{(vacations?.length ?? 0) === 1 ? "" : "s"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isPending ? (
						<p className="text-muted-foreground text-sm">Loading...</p>
					) : !vacations?.length ? (
						<p className="text-muted-foreground text-sm">No vacation requests yet.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Guide</TableHead>
									<TableHead>Start</TableHead>
									<TableHead>End</TableHead>
									<TableHead>Days</TableHead>
									<TableHead>Reason</TableHead>
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{vacations.map((v) => {
									const days = Math.floor(
										(Date.parse(v.endDate) - Date.parse(v.startDate)) /
											86_400_000 +
											1,
									);
									return (
										<TableRow key={v._id}>
											<TableCell className="font-mono text-xs">
												{v.userId}
											</TableCell>
											<TableCell>{v.startDate}</TableCell>
											<TableCell>{v.endDate}</TableCell>
											<TableCell>{days}</TableCell>
											<TableCell className="max-w-[200px] truncate">
												{v.reason}
											</TableCell>
											<TableCell>
												<Badge
													className={statusColors[v.status] ?? ""}
													variant="secondary"
												>
													{v.status}
												</Badge>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}