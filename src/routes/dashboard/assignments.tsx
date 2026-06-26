import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/assignments")({
	component: AssignmentsPage,
});

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
	{
		key: "date",
		header: "Date",
		render: (a) => (
			<Link
				to="/dashboard/assignments/$assignmentId"
				params={{ assignmentId: a._id }}
				className="font-medium text-blue-600 hover:underline"
			>
				{a.date}
			</Link>
		),
		searchValue: (a) => a.date,
	},
	{
		key: "time",
		header: "Time",
		render: (a) => <span className="font-mono text-xs">{a.startTime}–{a.endTime}</span>,
		searchValue: (a) => `${a.startTime} ${a.endTime}`,
	},
	{ key: "guide", header: "Guide", render: (a) => <span className="font-mono text-xs">{a.guideId}</span>, searchValue: (a) => a.guideId },
	{ key: "tour", header: "Tour", render: (a) => <span className="font-mono text-xs">{a.tourId}</span>, searchValue: (a) => a.tourId },
	{
		key: "status",
		header: "Status",
		render: (a) => <StatusBadge status={a.status} />,
		searchValue: (a) => a.status,
	},
];

function AssignmentsPage() {
	const { data: assignments, isPending, error } = useQuery(
		convexQuery(api.assignments.list, {}),
	);
	const itemCount = assignments?.length ?? 0;

	return (
		<ListPage
			title="Assignments"
			description={`${itemCount} assignment${itemCount === 1 ? "" : "s"}`}
			newTo="/dashboard/assignments/new"
			newLabel="+ New assignment"
		>
			<DataTable
				data={assignments as Assignment[] | undefined}
				columns={columns}
				rowKey={(a) => a._id}
				isPending={isPending}
				error={error}
				emptyMessage="No assignments yet."
				searchPlaceholder="Search by date, time, guide, or status…"
			/>
		</ListPage>
	);
}
