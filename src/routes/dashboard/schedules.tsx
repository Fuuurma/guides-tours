import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/schedules")({
	component: SchedulesPage,
});

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
		render: (s) => <span className="font-mono text-xs">{s.startTime}–{s.endTime}</span>,
		searchValue: (s) => `${s.startTime} ${s.endTime}`,
	},
	{ key: "booked", header: "Booked", render: (s) => s.capacityBooked },
	{ key: "capacity", header: "Capacity", render: (s) => s.capacityTotal },
	{
		key: "status",
		header: "Status",
		render: (s) => <StatusBadge status={s.status} />,
		searchValue: (s) => s.status,
	},
];

function SchedulesPage() {
	const { data: schedules, isPending, error } = useQuery(
		convexQuery(api.tourSchedules.list, {}),
	);
	const itemCount = schedules?.length ?? 0;

	return (
		<ListPage
			title="Tour schedules"
			description={`${itemCount} schedule${itemCount === 1 ? "" : "s"} — concrete tour instances that customers can book against.`}
			newTo="/dashboard/schedules/new"
			newLabel="+ New schedule"
		>
			<DataTable
				data={schedules as Schedule[] | undefined}
				columns={columns}
				rowKey={(s) => s._id}
				isPending={isPending}
				error={error}
				emptyMessage="No schedules yet."
				searchPlaceholder="Search by date, time, or status…"
			/>
		</ListPage>
	);
}
