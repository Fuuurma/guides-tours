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
		render: (d) => (
			<Link
				to="/dashboard/drivers/$driverId"
				params={{ driverId: d._id }}
				className="font-mono text-xs text-blue-600 hover:underline"
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
		render: (d) =>
			d.isActive ? (
				<Badge>Active</Badge>
			) : (
				<Badge variant="secondary">Inactive</Badge>
			),
		searchValue: (d) => (d.isActive ? "active" : "inactive"),
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
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<div>
						<CardTitle>Drivers</CardTitle>
						<CardDescription>
							{itemCount} driver{itemCount === 1 ? "" : "s"}
						</CardDescription>
					</div>
					<Button asChild>
						<Link to="/dashboard/drivers/new">+ New driver</Link>
					</Button>
				</CardHeader>
				<CardContent>
					<DataTable
						data={drivers as Driver[] | undefined}
						columns={columns}
						rowKey={(d) => d._id}
						isPending={isPending}
						error={error}
						emptyMessage="No drivers yet."
						searchPlaceholder="Search by user ID, license, or status…"
					/>
				</CardContent>
			</Card>
		</div>
	);
}