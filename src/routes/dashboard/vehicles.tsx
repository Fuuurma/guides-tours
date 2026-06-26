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

export const Route = createFileRoute("/dashboard/vehicles")({
	component: VehiclesPage,
});

const statusColors: Record<string, string> = {
	available: "bg-green-100 text-green-800",
	in_use: "bg-blue-100 text-blue-800",
	maintenance: "bg-yellow-100 text-yellow-800",
	retired: "bg-gray-100 text-gray-800",
};

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
		render: (v) => (
			<Badge className={statusColors[v.status] ?? ""} variant="secondary">
				{v.status}
			</Badge>
		),
		searchValue: (v) => v.status,
	},
];

function VehiclesPage() {
	const { data: vehicles, isPending, error } = useQuery(
		convexQuery(api.vehicles.list, {}),
	);

	const itemCount = vehicles?.length ?? 0;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<div>
						<CardTitle>Vehicles</CardTitle>
						<CardDescription>
							{itemCount} vehicle{itemCount === 1 ? "" : "s"}
						</CardDescription>
					</div>
					<Button asChild>
						<Link to="/dashboard/vehicles/new">+ New vehicle</Link>
					</Button>
				</CardHeader>
				<CardContent>
					<DataTable
						data={vehicles as Vehicle[] | undefined}
						columns={columns}
						rowKey={(v) => v._id}
						isPending={isPending}
						error={error}
						emptyMessage="No vehicles yet."
						searchPlaceholder="Search by name, type, plate, or status…"
					/>
				</CardContent>
			</Card>
		</div>
	);
}