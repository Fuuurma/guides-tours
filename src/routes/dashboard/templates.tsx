import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getErrorMessage } from "@/lib/utils";
import type { TourTemplate as Template } from "@/types/entities";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/templates")({
	component: TemplatesPage,
});

function TemplatesPage() {
	const {
		data: templates,
		isPending,
		error,
	} = useQuery(convexQuery(api.tourTemplates.list, {}));
	const updateTemplate = useMutation(api.tourTemplates.update);
	const removeTemplate = useMutation(api.tourTemplates.remove);
	const confirm = useConfirm();
	const [pending, setPending] = useState<{
		id: string;
		kind: "toggle" | "delete";
	} | null>(null);

	const toggleActive = async (id: string, currentActive: boolean) => {
		setPending({ id, kind: "toggle" });
		try {
			await updateTemplate({
				templateId: id as Id<"tourTemplates">,
				isActive: !currentActive,
			});
			toast.success(currentActive ? "Template disabled" : "Template enabled");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(null);
		}
	};
	const onDelete = async (id: string, label: string) => {
		const ok = await confirm({
			title: `Delete "${label}"?`,
			description: "This won't affect tours created from it.",
			variant: "destructive",
		});
		if (!ok) {
			return;
		}
		setPending({ id, kind: "delete" });
		try {
			await removeTemplate({ templateId: id as Id<"tourTemplates"> });
			toast.success("Template deleted");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(null);
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
				const rowBusy = pending?.id === t._id;
				const toggling = rowBusy && pending?.kind === "toggle";
				const deleting = rowBusy && pending?.kind === "delete";
				return (
					<div className="flex items-center justify-end gap-1">
						<Button
							size="sm"
							variant="outline"
							onClick={() => toggleActive(t._id, t.isActive)}
							disabled={rowBusy}
						>
							{toggling ? <Spinner data-icon="inline-start" /> : null}
							{t.isActive ? "Disable" : "Enable"}
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => onDelete(t._id, t.name)}
							disabled={rowBusy}
						>
							{deleting ? <Spinner data-icon="inline-start" /> : null}
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
				emptyMessage="No templates yet"
				emptyDescription="Save defaults so you can spin up similar tours without re-entering staffing and copy."
				emptyAction={
					<Button asChild size="sm">
						<Link to="/dashboard/templates/new">
							Create your first template
						</Link>
					</Button>
				}
				searchPlaceholder="Search by name, type, or status…"
			/>
		</ListPage>
	);
}
