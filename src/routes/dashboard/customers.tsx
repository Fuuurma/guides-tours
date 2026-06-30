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
	const [pendingId, setPendingId] = useState<string | null>(null);

	const toggleVip = async (id: string, currentVip: boolean) => {
		setPendingId(id);
		try {
			await updateCustomer({
				customerId: id as Id<"customers">,
				vipStatus: !currentVip,
			});
			toast.success(currentVip ? "Removed from VIP" : "Marked as VIP");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPendingId(null);
		}
	};
	const onDelete = async (id: string, label: string) => {
		if (
			!window.confirm(
				`Delete customer "${label}"? Their booking history will be removed from the dashboard.`,
			)
		) {
			return;
		}
		setPendingId(id);
		try {
			await removeCustomer({ customerId: id as Id<"customers"> });
			toast.success("Customer deleted");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPendingId(null);
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
				const isBusy = pendingId === c._id;
				return (
					<div className="flex items-center gap-1 justify-end">
						<Button
							size="sm"
							variant="outline"
							onClick={() => toggleVip(c._id, c.vipStatus)}
							disabled={isBusy}
						>
							{c.vipStatus ? "Un-VIP" : "Mark VIP"}
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => onDelete(c._id, c.name)}
							disabled={isBusy}
						>
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
			description={`${itemCount} customer${itemCount === 1 ? "" : "s"}${
				vipOnly === true ? " · VIP only" : vipOnly === false ? " · non-VIP" : ""
			}`}
			newTo="/dashboard/customers/new"
			newLabel="+ New customer"
		>
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<span className="text-muted-foreground text-sm">Status:</span>
				{(["vip", "regular"] as const).map((s) => {
					const targetValue = s === "vip";
					const active = vipOnly === targetValue;
					return (
						<Button
							key={s}
							variant={active ? "default" : "outline"}
							size="sm"
							onClick={() => setVipOnly(active ? null : targetValue)}
							aria-pressed={active}
						>
							{s === "vip" ? "VIP" : "Regular"}
						</Button>
					);
				})}
				{vipOnly !== null && (
					<Button variant="ghost" size="sm" onClick={() => setVipOnly(null)}>
						Clear
					</Button>
				)}
			</div>
			<DataTable
				data={customers?.items as Customer[] | undefined}
				columns={columns}
				rowKey={(c) => c._id}
				isPending={isPending}
				error={error}
				emptyMessage={
					vipOnly === true
						? "No VIP customers yet."
						: vipOnly === false
							? "No regular customers yet."
							: "No customers yet."
				}
				searchPlaceholder="Search by name, email, or status…"
			/>
		</ListPage>
	);
}
