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

export const Route = createFileRoute("/dashboard/vacations")({
	component: VacationsPage,
});

const statusColors: Record<string, string> = {
	pending: "bg-yellow-100 text-yellow-800",
	approved: "bg-green-100 text-green-800",
	rejected: "bg-red-100 text-red-800",
};

interface Vacation {
	_id: string;
	userId: string;
	startDate: string;
	endDate: string;
	reason: string;
	status: "pending" | "approved" | "rejected";
}

const columns: DataTableColumn<Vacation>[] = [
	{
		key: "userId",
		header: "Guide",
		render: (v) => <span className="font-mono text-xs">{v.userId}</span>,
	},
	{ key: "start", header: "Start", render: (v) => v.startDate },
	{ key: "end", header: "End", render: (v) => v.endDate },
	{
		key: "days",
		header: "Days",
		render: (v) =>
			Math.floor(
				(Date.parse(v.endDate) - Date.parse(v.startDate)) / 86_400_000 + 1,
			),
	},
	{
		key: "reason",
		header: "Reason",
		render: (v) => (
			<span className="max-w-[200px] truncate inline-block">{v.reason}</span>
		),
	},
	{
		key: "status",
		header: "Status",
		render: (v) => (
			<Badge className={statusColors[v.status] ?? ""} variant="secondary">
				{v.status}
			</Badge>
		),
	},
];

function VacationsPage() {
	const { data: vacations, isPending, error } = useQuery(
		convexQuery(api.vacationRequests.list, {}),
	);

	const itemCount = vacations?.length ?? 0;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Vacation requests</CardTitle>
					<CardDescription>
						{itemCount} request{itemCount === 1 ? "" : "s"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<DataTable
						data={vacations as Vacation[] | undefined}
						columns={columns}
						rowKey={(v) => v._id}
						isPending={isPending}
						error={error}
						emptyMessage="No vacation requests yet."
					/>
				</CardContent>
			</Card>
		</div>
	);
}