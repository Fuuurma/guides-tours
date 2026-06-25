import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/data-table";
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
	{ key: "name", header: "Name", render: (c) => c.name, className: "font-medium" },
	{ key: "email", header: "Email", render: (c) => c.email },
	{ key: "phone", header: "Phone", render: (c) => c.phone },
	{ key: "visits", header: "Visits", render: (c) => c.totalVisits },
	{
		key: "status",
		header: "Status",
		render: (c) =>
			c.vipStatus ? (
				<Badge>VIP</Badge>
			) : (
				<Badge variant="secondary">Regular</Badge>
			),
	},
];

function CustomersPage() {
	const { data: customers, isPending, error } = useQuery(
		convexQuery(api.customers.list, {}),
	);

	const itemCount = customers?.items?.length ?? 0;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Customers</CardTitle>
					<CardDescription>
						{itemCount} customer{itemCount === 1 ? "" : "s"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<DataTable
						data={customers?.items as Customer[] | undefined}
						columns={columns}
						rowKey={(c) => c._id}
						isPending={isPending}
						error={error}
						emptyMessage="No customers yet."
					/>
				</CardContent>
			</Card>
		</div>
	);
}