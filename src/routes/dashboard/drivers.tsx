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

export const Route = createFileRoute("/dashboard/drivers")({
	component: DriversPage,
});

interface Driver {
	_id: string;
	userId: string;
	licenseInfo: string;
	isActive: boolean;
}

const columns: DataTableColumn<Driver>[] = [
	{
		key: "userId",
		header: "User ID",
		render: (d) => <span className="font-mono text-xs">{d.userId}</span>,
	},
	{ key: "license", header: "License", render: (d) => d.licenseInfo },
	{
		key: "status",
		header: "Status",
		render: (d) =>
			d.isActive ? (
				<Badge>Active</Badge>
			) : (
				<Badge variant="secondary">Inactive</Badge>
			),
	},
];

function DriversPage() {
	const { data: drivers, isPending, error } = useQuery(
		convexQuery(api.drivers.list, {}),
	);

	const itemCount = drivers?.length ?? 0;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Drivers</CardTitle>
					<CardDescription>
						{itemCount} driver{itemCount === 1 ? "" : "s"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<DataTable
						data={drivers as Driver[] | undefined}
						columns={columns}
						rowKey={(d) => d._id}
						isPending={isPending}
						error={error}
						emptyMessage="No drivers yet."
					/>
				</CardContent>
			</Card>
		</div>
	);
}