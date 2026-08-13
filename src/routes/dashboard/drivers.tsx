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
import { Spinner } from "@/components/ui/spinner";
import { useOrgMembers } from "@/hooks/use-org-members";
import { getErrorMessage } from "@/lib/utils";
import type { Driver } from "@/types/entities";
import { api } from "../../../convex/_generated/api";
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
	const { displayName } = useOrgMembers();
	const setActive = useMutation(api.drivers.setActive);
	const removeDriver = useMutation(api.drivers.remove);
	const confirm = useConfirm();
	const [pending, setPending] = useState<{
		id: string;
		kind: "toggle" | "delete";
	} | null>(null);

	const toggleActive = async (id: string, currentActive: boolean) => {
		setPending({ id, kind: "toggle" });
		try {
			await setActive({
				driverId: id as Id<"drivers">,
				isActive: !currentActive,
			});
			toast.success(currentActive ? "Driver deactivated" : "Driver activated");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(null);
		}
	};
	const onDelete = async (id: string, label: string) => {
		const ok = await confirm({
			title: `Delete driver "${label}"?`,
			description: "Future assignments can't use this driver.",
			variant: "destructive",
		});
		if (!ok) {
			return;
		}
		setPending({ id, kind: "delete" });
		try {
			await removeDriver({ driverId: id as Id<"drivers"> });
			toast.success("Driver deleted");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(null);
		}
	};

	const columns: DataTableColumn<Driver>[] = [
		{
			key: "userId",
			header: "Driver",
			render: (d) => (
				<Link
					to="/dashboard/drivers/$driverId"
					params={{ driverId: d._id }}
					className="text-link hover:underline font-medium"
				>
					{displayName(d.userId)}
				</Link>
			),
			searchValue: (d) => displayName(d.userId),
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
				const rowBusy = pending?.id === d._id;
				const toggling = rowBusy && pending?.kind === "toggle";
				const deleting = rowBusy && pending?.kind === "delete";
				const label = displayName(d.userId);
				return (
					<div className="flex items-center justify-end gap-1">
						<Button
							size="sm"
							variant="outline"
							onClick={() => toggleActive(d._id, d.isActive)}
							disabled={rowBusy}
						>
							{toggling ? <Spinner data-icon="inline-start" /> : null}
							{d.isActive ? "Deactivate" : "Activate"}
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => onDelete(d._id, label)}
							disabled={rowBusy}
						>
							{deleting ? <Spinner data-icon="inline-start" /> : null}
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
			description={`${itemCount} driver${itemCount === 1 ? "" : "s"} — people who can drive a vehicle on a departure`}
			newTo="/dashboard/drivers/new"
			newLabel="+ New driver"
		>
			<DataTable
				data={drivers as Driver[] | undefined}
				columns={columns}
				rowKey={(d) => d._id}
				isPending={isPending}
				error={error}
				emptyMessage="No drivers yet"
				emptyDescription="Attach a driver profile to a member, then assign them to vehicle-required tours."
				emptyAction={
					<Button asChild size="sm">
						<Link to="/dashboard/drivers/new">Add your first driver</Link>
					</Button>
				}
				searchPlaceholder="Search by name, license, or status…"
			/>
		</ListPage>
	);
}
