import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useOrgMembers } from "@/hooks/use-org-members";
import type { Vacation } from "@/types/entities";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/vacations")({
	component: VacationsPage,
});

function VacationsPage() {
	const {
		data: vacations,
		isPending,
		error,
	} = useQuery(convexQuery(api.vacationRequests.list, {}));
	const { displayName } = useOrgMembers();

	const columns: DataTableColumn<Vacation>[] = [
		{
			key: "userId",
			header: "Staff",
			render: (v) => (
				<Link
					to="/dashboard/vacations/$vacationId"
					params={{ vacationId: v._id }}
					className="text-link hover:underline"
				>
					{displayName(v.userId)}
				</Link>
			),
			searchValue: (v) => displayName(v.userId),
		},
		{
			key: "start",
			header: "Start",
			render: (v) => v.startDate,
			searchValue: (v) => v.startDate,
		},
		{
			key: "end",
			header: "End",
			render: (v) => v.endDate,
			searchValue: (v) => v.endDate,
		},
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
			searchValue: (v) => v.reason,
		},
		{
			key: "status",
			header: "Status",
			render: (v) => <StatusBadge status={v.status} />,
			searchValue: (v) => v.status,
		},
	];

	const itemCount = vacations?.length ?? 0;

	return (
		<ListPage
			title="Vacation requests"
			description={`${itemCount} request${itemCount === 1 ? "" : "s"} — time off that blocks overlapping assignments`}
			newTo="/dashboard/vacations/new"
			newLabel="+ New request"
		>
			<DataTable
				data={vacations as Vacation[] | undefined}
				columns={columns}
				rowKey={(v) => v._id}
				isPending={isPending}
				error={error}
				emptyMessage="No vacation requests yet"
				emptyDescription="Record time off so assignments don't overlap a guide who is away."
				emptyAction={
					<Button asChild size="sm">
						<Link to="/dashboard/vacations/new">Create a request</Link>
					</Button>
				}
				searchPlaceholder="Search by staff, dates, reason, or status…"
			/>
		</ListPage>
	);
}
