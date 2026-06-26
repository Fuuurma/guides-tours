import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/drivers")({
	component: DriversPage,
});

interface Driver {
	_id: string;
	userId: string;
	licenseInfo: string;
	isActive: boolean;
}

const columns: DataTableColumn<Driver>[] = [
	{
		key: "userId",
		header: "User ID",
		render: (d) => (
			<Link
				to="/dashboard/drivers/$driverId"
				params={{ driverId: d._id }}
				className="font-mono text-xs text-blue-600 hover:underline"
			>
				{d.userId}
			</Link>
		),
		searchValue: (d) => d.userId,
	},
	{ key: "license", header: "License", render: (d) => d.licenseInfo, searchValue: (d) => d.licenseInfo },
	{
		key: "status",
		header: "Status",
		render: (d) => <StatusBadge status={d.isActive ? "active" : "inactive"} />,
		searchValue: (d) => (d.isActive ? "active" : "inactive"),
	},
];

function DriversPage() {
	const { data: drivers, isPending, error } = useQuery(
		convexQuery(api.drivers.list, {}),
	);
	const itemCount = drivers?.length ?? 0;

	return (
		<ListPage
			title="Drivers"
			description={`${itemCount} driver${itemCount === 1 ? "" : "s"}`}
			newTo="/dashboard/drivers/new"
			newLabel="+ New driver"
		>
			<DataTable
				data={drivers as Driver[] | undefined}
				columns={columns}
				rowKey={(d) => d._id}
				isPending={isPending}
				error={error}
				emptyMessage="No drivers yet."
				searchPlaceholder="Search by user ID, license, or status…"
			/>
		</ListPage>
	);
}
