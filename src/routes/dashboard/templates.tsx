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
	{ key: "name", header: "Name", render: (t) => t.name, className: "font-medium" },
	{ key: "type", header: "Type", render: (t) => t.tourType },
	{ key: "duration", header: "Duration", render: (t) => `${t.durationHours}h` },
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
				<CardHeader>
					<CardTitle>Tour templates</CardTitle>
					<CardDescription>
						{itemCount} template{itemCount === 1 ? "" : "s"} — use
						templates to spin up multiple tours with shared defaults.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<DataTable
						data={templates as Template[] | undefined}
						columns={columns}
						rowKey={(t) => t._id}
						isPending={isPending}
						error={error}
						emptyMessage="No templates yet."
					/>
				</CardContent>
			</Card>
		</div>
	);
}