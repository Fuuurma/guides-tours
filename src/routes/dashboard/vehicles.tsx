import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/vehicles")({
	component: VehiclesPage,
});

interface Vehicle {
	_id: string;
	name: string;
	vehicleType: string;
	licensePlate: string;
	capacity: number;
	status: string;
}

const columns: DataTableColumn<Vehicle>[] = [
	{
		key: "name",
		header: "Name",
		render: (v) => (
			<Link
				to="/dashboard/vehicles/$vehicleId"
				params={{ vehicleId: v._id }}
				className="font-medium text-blue-600 hover:underline"
			>
				{v.name}
			</Link>
		),
		searchValue: (v) => v.name,
	},
	{ key: "type", header: "Type", render: (v) => v.vehicleType, searchValue: (v) => v.vehicleType },
	{ key: "plate", header: "Plate", render: (v) => v.licensePlate, searchValue: (v) => v.licensePlate },
	{ key: "capacity", header: "Capacity", render: (v) => v.capacity },
	{
		key: "status",
		header: "Status",
		render: (v) => <StatusBadge status={v.status} />,
		searchValue: (v) => v.status,
	},
];

function VehiclesPage() {
	const { data: vehicles, isPending, error } = useQuery(
		convexQuery(api.vehicles.list, {}),
	);
	const itemCount = vehicles?.length ?? 0;

	return (
		<ListPage
			title="Vehicles"
			description={`${itemCount} vehicle${itemCount === 1 ? "" : "s"}`}
			newTo="/dashboard/vehicles/new"
			newLabel="+ New vehicle"
		>
			<DataTable
				data={vehicles as Vehicle[] | undefined}
				columns={columns}
				rowKey={(v) => v._id}
				isPending={isPending}
				error={error}
				emptyMessage="No vehicles yet."
				searchPlaceholder="Search by name, type, plate, or status…"
			/>
		</ListPage>
	);
}
