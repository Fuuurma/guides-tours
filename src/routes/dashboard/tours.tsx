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

export const Route = createFileRoute("/dashboard/tours")({
	component: ToursPage,
});

interface Tour {
	_id: string;
	name: string;
	tourType: string;
	durationHours: number;
	minGuests: number;
	maxGuests: number;
	isActive: boolean;
}

const columns: DataTableColumn<Tour>[] = [
	{
		key: "name",
		header: "Name",
		render: (t) => (
			<Link
				to="/dashboard/tours/$tourId"
				params={{ tourId: t._id }}
				className="font-medium text-blue-600 hover:underline"
			>
				{t.name}
			</Link>
		),
	},
	{ key: "type", header: "Type", render: (t) => t.tourType },
	{ key: "duration", header: "Duration", render: (t) => `${t.durationHours}h` },
	{ key: "capacity", header: "Capacity", render: (t) => `${t.minGuests}–${t.maxGuests}` },
	{
		key: "status",
		header: "Status",
		render: (t) =>
			t.isActive ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>,
	},
];

function ToursPage() {
	const { data: tours, isPending, error } = useQuery(
		convexQuery(api.tours.list, {}),
	);

	const itemCount = tours?.length ?? 0;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<div>
						<CardTitle>Tours</CardTitle>
						<CardDescription>
							{itemCount} tour{itemCount === 1 ? "" : "s"}
						</CardDescription>
					</div>
					<Button asChild>
						<Link to="/dashboard/tours/new">+ New tour</Link>
					</Button>
				</CardHeader>
				<CardContent>
					<DataTable
						data={tours as Tour[] | undefined}
						columns={columns}
						rowKey={(t) => t._id}
						isPending={isPending}
						error={error}
						emptyMessage="No tours yet."
					/>
				</CardContent>
			</Card>
		</div>
	);
}
