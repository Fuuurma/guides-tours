import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/customers")({
	component: CustomersPage,
});

interface Customer {
	_id: string;
	name: string;
	email: string;
	phone: string;
	totalVisits: number;
	vipStatus: boolean;
}

const columns: DataTableColumn<Customer>[] = [
	{
		key: "name",
		header: "Name",
		render: (c) => (
			<Link
				to="/dashboard/customers/$customerId"
				params={{ customerId: c._id }}
				className="font-medium text-blue-600 hover:underline"
			>
				{c.name}
			</Link>
		),
		searchValue: (c) => c.name,
	},
	{ key: "email", header: "Email", render: (c) => c.email, searchValue: (c) => c.email },
	{ key: "phone", header: "Phone", render: (c) => c.phone, searchValue: (c) => c.phone },
	{ key: "visits", header: "Visits", render: (c) => c.totalVisits },
	{
		key: "status",
		header: "Status",
		render: (c) => <StatusBadge status={c.vipStatus ? "vip" : "regular"} />,
		searchValue: (c) => (c.vipStatus ? "vip" : "regular"),
	},
];

function CustomersPage() {
	const { data: customers, isPending, error } = useQuery(
		convexQuery(api.customers.list, {}),
	);
	const itemCount = customers?.items?.length ?? 0;

	return (
		<ListPage
			title="Customers"
			description={`${itemCount} customer${itemCount === 1 ? "" : "s"}`}
			newTo="/dashboard/customers/new"
			newLabel="+ New customer"
		>
			<DataTable
				data={customers?.items as Customer[] | undefined}
				columns={columns}
				rowKey={(c) => c._id}
				isPending={isPending}
				error={error}
				emptyMessage="No customers yet."
				searchPlaceholder="Search by name, email, or status…"
			/>
		</ListPage>
	);
}
