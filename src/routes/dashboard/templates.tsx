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

export const Route = createFileRoute("/dashboard/templates")({
	component: TemplatesPage,
});

interface Template {
	_id: string;
	name: string;
	tourType: string;
	durationHours: number;
	capacity: number;
	isActive: boolean;
}

const columns: DataTableColumn<Template>[] = [
	{
		key: "name",
		header: "Name",
		render: (t) => (
			<Link
				to="/dashboard/templates/$templateId"
				params={{ templateId: t._id }}
				className="font-medium text-blue-600 hover:underline"
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
	{
		key: "duration",
		header: "Duration",
		render: (t) => `${t.durationHours}h`,
	},
	{ key: "capacity", header: "Capacity", render: (t) => t.capacity },
	{
		key: "active",
		header: "Status",
		render: (t) =>
			t.isActive ? (
				<Badge>Active</Badge>
			) : (
				<Badge variant="secondary">Inactive</Badge>
			),
		searchValue: (t) => (t.isActive ? "active" : "inactive"),
	},
];

function TemplatesPage() {
	const { data: templates, isPending, error } = useQuery(
		convexQuery(api.tourTemplates.list, {}),
	);

	const itemCount = templates?.length ?? 0;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<div>
						<CardTitle>Tour templates</CardTitle>
						<CardDescription>
							{itemCount} template{itemCount === 1 ? "" : "s"} — use
							templates to spin up multiple tours with shared defaults.
						</CardDescription>
					</div>
					<Button asChild>
						<Link to="/dashboard/templates/new">+ New template</Link>
					</Button>
				</CardHeader>
				<CardContent>
					<DataTable
						data={templates as Template[] | undefined}
						columns={columns}
						rowKey={(t) => t._id}
						isPending={isPending}
						error={error}
						emptyMessage="No templates yet."
						searchPlaceholder="Search by name, type, or status…"
					/>
				</CardContent>
			</Card>
		</div>
	);
}