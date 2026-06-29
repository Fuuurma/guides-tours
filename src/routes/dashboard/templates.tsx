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
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

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

function TemplatesPage() {
	const {
		data: templates,
		isPending,
		error,
	} = useQuery(convexQuery(api.tourTemplates.list, {}));
	const updateTemplate = useMutation(api.tourTemplates.update);
	const removeTemplate = useMutation(api.tourTemplates.remove);
	const [pendingId, setPendingId] = useState<string | null>(null);

	const toggleActive = async (id: string, currentActive: boolean) => {
		setPendingId(id);
		try {
			await updateTemplate({
				templateId: id as Id<"tourTemplates">,
				isActive: !currentActive,
			});
			toast.success(currentActive ? "Template disabled" : "Template enabled");
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setPendingId(null);
		}
	};
	const onDelete = async (id: string, label: string) => {
		if (
			!window.confirm(
				`Delete the "${label}" template? This won't affect tours created from it.`,
			)
		) {
			return;
		}
		setPendingId(id);
		try {
			await removeTemplate({ templateId: id as Id<"tourTemplates"> });
			toast.success("Template deleted");
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setPendingId(null);
		}
	};

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
			render: (t) => (
				<StatusBadge status={t.isActive ? "active" : "inactive"} />
			),
			searchValue: (t) => (t.isActive ? "active" : "inactive"),
		},
		{
			key: "actions",
			header: "",
			render: (t) => {
				const isBusy = pendingId === t._id;
				return (
					<div className="flex items-center gap-1 justify-end">
						<Button
							size="sm"
							variant="outline"
							onClick={() => toggleActive(t._id, t.isActive)}
							disabled={isBusy}
						>
							{t.isActive ? "Disable" : "Enable"}
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => onDelete(t._id, t.name)}
							disabled={isBusy}
						>
							Delete
						</Button>
					</div>
				);
			},
		},
	];

	const itemCount = templates?.length ?? 0;

	return (
		<ListPage
			title="Tour templates"
			description={`${itemCount} template${itemCount === 1 ? "" : "s"} — use templates to spin up multiple tours with shared defaults.`}
			newTo="/dashboard/templates/new"
			newLabel="+ New template"
		>
			<DataTable
				data={templates as Template[] | undefined}
				columns={columns}
				rowKey={(t) => t._id}
				isPending={isPending}
				error={error}
				emptyMessage="No templates yet."
				searchPlaceholder="Search by name, type, or status…"
			/>
		</ListPage>
	);
}
