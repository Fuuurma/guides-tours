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
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/assignments")({
	component: AssignmentsPage,
});

const statusColors: Record<string, string> = {
	scheduled: "bg-blue-100 text-blue-800",
	completed: "bg-green-100 text-green-800",
	cancelled: "bg-gray-100 text-gray-800",
};

interface Assignment {
	_id: string;
	date: string;
	startTime: string;
	endTime: string;
	guideId: string;
	tourId: string;
	status: "scheduled" | "completed" | "cancelled";
}

const columns: DataTableColumn<Assignment>[] = [
	{ key: "date", header: "Date", render: (a) => a.date },
	{
		key: "time",
		header: "Time",
		render: (a) => (
			<span className="font-mono text-xs">
				{a.startTime}–{a.endTime}
			</span>
		),
	},
	{
		key: "guide",
		header: "Guide",
		render: (a) => <span className="font-mono text-xs">{a.guideId}</span>,
	},
	{
		key: "tour",
		header: "Tour",
		render: (a) => <span className="font-mono text-xs">{a.tourId}</span>,
	},
	{
		key: "status",
		header: "Status",
		render: (a) => (
			<Badge className={statusColors[a.status] ?? ""} variant="secondary">
				{a.status}
			</Badge>
		),
	},
];

function AssignmentsPage() {
	const { data: assignments, isPending, error } = useQuery(
		convexQuery(api.assignments.list, {}),
	);

	const itemCount = assignments?.length ?? 0;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Assignments</CardTitle>
					<CardDescription>
						{itemCount} assignment{itemCount === 1 ? "" : "s"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<DataTable
						data={assignments as Assignment[] | undefined}
						columns={columns}
						rowKey={(a) => a._id}
						isPending={isPending}
						error={error}
						emptyMessage="No assignments yet."
					/>
				</CardContent>
			</Card>
		</div>
	);
}