import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "../../../convex/_generated/api";
import { getErrorMessage } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

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

const STATUS_OPTIONS = [
	"available",
	"in_use",
	"maintenance",
	"retired",
] as const;

function VehiclesPage() {
	const {
		data: vehicles,
		isPending,
		error,
	} = useQuery(convexQuery(api.vehicles.list, {}));
	const setStatus = useMutation(api.vehicles.setStatus);
	const removeVehicle = useMutation(api.vehicles.remove);
	const [pendingId, setPendingId] = useState<string | null>(null);

	const changeStatus = async (id: string, newStatus: string) => {
		setPendingId(id);
		try {
			await setStatus({
				vehicleId: id as Id<"vehicles">,
				status: newStatus as "available" | "in_use" | "maintenance" | "retired",
			});
			toast.success("Status updated");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPendingId(null);
		}
	};
	const onDelete = async (id: string, label: string) => {
		if (
			!window.confirm(
				`Delete "${label}"? Future assignments won't be able to use it.`,
			)
		) {
			return;
		}
		setPendingId(id);
		try {
			await removeVehicle({ vehicleId: id as Id<"vehicles"> });
			toast.success("Vehicle deleted");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPendingId(null);
		}
	};

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
		{
			key: "type",
			header: "Type",
			render: (v) => v.vehicleType,
			searchValue: (v) => v.vehicleType,
		},
		{
			key: "plate",
			header: "Plate",
			render: (v) => v.licensePlate,
			searchValue: (v) => v.licensePlate,
		},
		{ key: "capacity", header: "Capacity", render: (v) => v.capacity },
		{
			key: "status",
			header: "Status",
			render: (v) => <StatusBadge status={v.status} />,
			searchValue: (v) => v.status,
		},
		{
			key: "actions",
			header: "",
			render: (v) => {
				const isBusy = pendingId === v._id;
				return (
					<div className="flex items-center gap-1 justify-end">
						<Select
							value={v.status}
							onValueChange={(s) => changeStatus(v._id, s)}
							disabled={isBusy}
						>
							<SelectTrigger className="h-8 w-32 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{STATUS_OPTIONS.map((s) => (
									<SelectItem key={s} value={s}>
										{s}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => onDelete(v._id, v.name)}
							disabled={isBusy}
						>
							Delete
						</Button>
					</div>
				);
			},
		},
	];

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
