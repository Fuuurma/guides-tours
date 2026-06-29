import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
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
				className="font-medium text-link hover:underline"
			>
				{t.name}
			</Link>
		),
		searchValue: (t) => t.name,
	},
	{
		key: "type",
		header: "Type",
		render: (t) => t.tourType,
		searchValue: (t) => t.tourType,
	},
	{ key: "duration", header: "Duration", render: (t) => `${t.durationHours}h` },
	{
		key: "capacity",
		header: "Capacity",
		render: (t) => `${t.minGuests}–${t.maxGuests}`,
	},
	{
		key: "status",
		header: "Status",
		render: (t) => <StatusBadge status={t.isActive ? "active" : "inactive"} />,
		searchValue: (t) => (t.isActive ? "active" : "inactive"),
	},
];

function ToursPage() {
	const {
		data: tours,
		isPending,
		error,
	} = useQuery(convexQuery(api.tours.list, {}));
	const itemCount = tours?.length ?? 0;

	return (
		<ListPage
			title="Tours"
			description={`${itemCount} tour${itemCount === 1 ? "" : "s"}`}
			newTo="/dashboard/tours/new"
			newLabel="+ New tour"
		>
			<DataTable
				data={tours as Tour[] | undefined}
				columns={columns}
				rowKey={(t) => t._id}
				isPending={isPending}
				error={error}
				emptyMessage="No tours yet."
				searchPlaceholder="Search by name or type…"
			/>
		</ListPage>
	);
}
