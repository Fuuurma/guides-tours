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
import type { Driver } from "@/types/entities";
import { api } from "../../../convex/_generated/api";
import { getErrorMessage } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/drivers")({
	component: DriversPage,
});

function DriversPage() {
	const {
		data: drivers,
		isPending,
		error,
	} = useQuery(convexQuery(api.drivers.list, {}));
	const setActive = useMutation(api.drivers.setActive);
	const removeDriver = useMutation(api.drivers.remove);
	const [pendingId, setPendingId] = useState<string | null>(null);

	const toggleActive = async (id: string, currentActive: boolean) => {
		setPendingId(id);
		try {
			await setActive({
				driverId: id as Id<"drivers">,
				isActive: !currentActive,
			});
			toast.success(currentActive ? "Driver deactivated" : "Driver activated");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPendingId(null);
		}
	};
	const onDelete = async (id: string, label: string) => {
		if (
			!window.confirm(
				`Delete driver "${label}"? Future assignments can't use this driver.`,
			)
		) {
			return;
		}
		setPendingId(id);
		try {
			await removeDriver({ driverId: id as Id<"drivers"> });
			toast.success("Driver deleted");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPendingId(null);
		}
	};

	const columns: DataTableColumn<Driver>[] = [
		{
			key: "userId",
			header: "User ID",
			render: (d) => (
				<Link
					to="/dashboard/drivers/$driverId"
					params={{ driverId: d._id }}
					className="font-mono text-xs text-link hover:underline"
				>
					{d.userId}
				</Link>
			),
			searchValue: (d) => d.userId,
		},
		{
			key: "license",
			header: "License",
			render: (d) => d.licenseInfo,
			searchValue: (d) => d.licenseInfo,
		},
		{
			key: "status",
			header: "Status",
			render: (d) => (
				<StatusBadge status={d.isActive ? "active" : "inactive"} />
			),
			searchValue: (d) => (d.isActive ? "active" : "inactive"),
		},
		{
			key: "actions",
			header: "",
			render: (d) => {
				const isBusy = pendingId === d._id;
				return (
					<div className="flex items-center gap-1 justify-end">
						<Button
							size="sm"
							variant="outline"
							onClick={() => toggleActive(d._id, d.isActive)}
							disabled={isBusy}
						>
							{d.isActive ? "Deactivate" : "Activate"}
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => onDelete(d._id, d.userId)}
							disabled={isBusy}
						>
							Delete
						</Button>
					</div>
				);
			},
		},
	];

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
