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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getErrorMessage } from "@/lib/utils";
import type { Customer } from "@/types/entities";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/customers")({
	component: CustomersPage,
});

function CustomersPage() {
	const [vipOnly, setVipOnly] = useState<boolean | null>(null);

	const args: { vipOnly?: boolean } = {};
	if (vipOnly !== null) args.vipOnly = vipOnly;

	const {
		data: customers,
		isPending,
		error,
	} = useQuery(convexQuery(api.customers.list, args));
	const updateCustomer = useMutation(api.customers.update);
	const removeCustomer = useMutation(api.customers.remove);
	const confirm = useConfirm();
	const [pending, setPending] = useState<{
		id: string;
		kind: "vip" | "delete";
	} | null>(null);

	const toggleVip = async (id: string, currentVip: boolean) => {
		setPending({ id, kind: "vip" });
		try {
			await updateCustomer({
				customerId: id as Id<"customers">,
				vipStatus: !currentVip,
			});
			toast.success(currentVip ? "Removed from VIP" : "Marked as VIP");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(null);
		}
	};
	const onDelete = async (id: string, label: string) => {
		const ok = await confirm({
			title: `Delete customer "${label}"?`,
			description: "Their booking history will be removed from the dashboard.",
			variant: "destructive",
		});
		if (!ok) {
			return;
		}
		setPending({ id, kind: "delete" });
		try {
			await removeCustomer({ customerId: id as Id<"customers"> });
			toast.success("Customer deleted");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(null);
		}
	};

	const columns: DataTableColumn<Customer>[] = [
		{
			key: "name",
			header: "Name",
			render: (c) => (
				<Link
					to="/dashboard/customers/$customerId"
					params={{ customerId: c._id }}
					className="font-medium text-link hover:underline"
				>
					{c.name}
				</Link>
			),
			searchValue: (c) => c.name,
		},
		{
			key: "email",
			header: "Email",
			render: (c) => c.email,
			searchValue: (c) => c.email,
		},
		{
			key: "phone",
			header: "Phone",
			render: (c) => c.phone,
			searchValue: (c) => c.phone,
		},
		{ key: "visits", header: "Visits", render: (c) => c.totalVisits },
		{
			key: "status",
			header: "Status",
			render: (c) => <StatusBadge status={c.vipStatus ? "vip" : "regular"} />,
			searchValue: (c) => (c.vipStatus ? "vip" : "regular"),
		},
		{
			key: "actions",
			header: "",
			render: (c) => {
				const rowBusy = pending?.id === c._id;
				const toggling = rowBusy && pending?.kind === "vip";
				const deleting = rowBusy && pending?.kind === "delete";
				return (
					<div className="flex items-center justify-end gap-1">
						<Button
							size="sm"
							variant="outline"
							onClick={() => toggleVip(c._id, c.vipStatus)}
							disabled={rowBusy}
						>
							{toggling ? <Spinner data-icon="inline-start" /> : null}
							{c.vipStatus ? "Un-VIP" : "Mark VIP"}
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => onDelete(c._id, c.name)}
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

	const itemCount = customers?.items?.length ?? 0;

	return (
		<ListPage
			title="Customers"
			description={`${itemCount} customer${itemCount === 1 ? "" : "s"} — people you book onto departures`}
			newTo="/dashboard/customers/new"
			newLabel="+ New customer"
		>
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<span className="text-muted-foreground text-sm">Status</span>
				<ToggleGroup
					type="single"
					variant="outline"
					size="sm"
					value={vipOnly === true ? "vip" : vipOnly === false ? "regular" : ""}
					onValueChange={(v) => {
						if (v === "vip") setVipOnly(true);
						else if (v === "regular") setVipOnly(false);
						else setVipOnly(null);
					}}
				>
					<ToggleGroupItem value="vip">VIP</ToggleGroupItem>
					<ToggleGroupItem value="regular">Regular</ToggleGroupItem>
				</ToggleGroup>
			</div>
			<DataTable
				data={customers?.items as Customer[] | undefined}
				columns={columns}
				rowKey={(c) => c._id}
				isPending={isPending}
				error={error}
				emptyMessage={
					vipOnly === true
						? "No VIP customers"
						: vipOnly === false
							? "No regular customers"
							: "No customers yet"
				}
				emptyDescription={
					vipOnly === null
						? "Add them before a walk-up booking so you can attach the party to a departure."
						: undefined
				}
				emptyAction={
					vipOnly === null ? (
						<Button asChild size="sm">
							<Link to="/dashboard/customers/new">Add your first customer</Link>
						</Button>
					) : undefined
				}
				searchPlaceholder="Search by name, email, or status…"
			/>
		</ListPage>
	);
}
