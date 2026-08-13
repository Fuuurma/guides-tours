import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/utils";
import type { Vehicle } from "@/types/entities";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/vehicles")({
	component: VehiclesPage,
});

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
	const confirm = useConfirm();
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
		const ok = await confirm({
			title: `Delete "${label}"?`,
			description: "Future assignments won't be able to use it.",
			variant: "destructive",
		});
		if (!ok) {
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
					className="font-medium text-link hover:underline"
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
								<SelectGroup>
									{STATUS_OPTIONS.map((s) => (
										<SelectItem key={s} value={s}>
											{s}
										</SelectItem>
									))}
								</SelectGroup>
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
			description={`${itemCount} vehicle${itemCount === 1 ? "" : "s"} — fleet for tours that need one`}
			newTo="/dashboard/vehicles/new"
			newLabel="+ New vehicle"
		>
			<DataTable
				data={vehicles as Vehicle[] | undefined}
				columns={columns}
				rowKey={(v) => v._id}
				isPending={isPending}
				error={error}
				emptyMessage="No vehicles yet"
				emptyDescription="Add vans, boats, or other vehicles so you can assign them to departures."
				emptyAction={
					<Button asChild size="sm">
						<Link to="/dashboard/vehicles/new">Add your first vehicle</Link>
					</Button>
				}
				searchPlaceholder="Search by name, type, plate, or status…"
			/>
		</ListPage>
	);
}
