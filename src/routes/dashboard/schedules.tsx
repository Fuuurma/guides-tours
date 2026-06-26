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
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/schedules")({
	component: SchedulesPage,
});

const statusColors: Record<string, string> = {
	available: "bg-green-100 text-green-800",
	full: "bg-yellow-100 text-yellow-800",
	cancelled: "bg-gray-100 text-gray-800",
};

interface Schedule {
	_id: string;
	date: string;
	startTime: string;
	endTime: string;
	capacityBooked: number;
	capacityTotal: number;
	status: "available" | "full" | "cancelled";
}

const columns: DataTableColumn<Schedule>[] = [
	{
		key: "date",
		header: "Date",
		render: (s) => (
			<Link
				to="/dashboard/schedules/$scheduleId"
				params={{ scheduleId: s._id }}
				className="font-medium text-blue-600 hover:underline"
			>
				{s.date}
			</Link>
		),
		searchValue: (s) => s.date,
	},
	{
		key: "time",
		header: "Time",
		render: (s) => (
			<span className="font-mono text-xs">
				{s.startTime}–{s.endTime}
			</span>
		),
		searchValue: (s) => `${s.startTime} ${s.endTime}`,
	},
	{ key: "booked", header: "Booked", render: (s) => s.capacityBooked },
	{ key: "capacity", header: "Capacity", render: (s) => s.capacityTotal },
	{
		key: "status",
		header: "Status",
		render: (s) => (
			<Badge className={statusColors[s.status] ?? ""} variant="secondary">
				{s.status}
			</Badge>
		),
		searchValue: (s) => s.status,
	},
];

function SchedulesPage() {
	const { data: schedules, isPending, error } = useQuery(
		convexQuery(api.tourSchedules.list, {}),
	);

	const itemCount = schedules?.length ?? 0;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<div>
						<CardTitle>Tour schedules</CardTitle>
						<CardDescription>
							{itemCount} schedule{itemCount === 1 ? "" : "s"} — concrete
							tour instances that customers can book against.
						</CardDescription>
					</div>
					<Button asChild>
						<Link to="/dashboard/schedules/new">+ New schedule</Link>
					</Button>
				</CardHeader>
				<CardContent>
					<DataTable
						data={schedules as Schedule[] | undefined}
						columns={columns}
						rowKey={(s) => s._id}
						isPending={isPending}
						error={error}
						emptyMessage="No schedules yet."
						searchPlaceholder="Search by date, time, or status…"
					/>
				</CardContent>
			</Card>
		</div>
	);
}