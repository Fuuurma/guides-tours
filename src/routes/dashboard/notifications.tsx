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
import { getErrorMessage } from "@/lib/utils";
import type { NotificationTemplate } from "@/types/entities";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/notifications")({
	component: NotificationTemplatesPage,
});

function NotificationTemplatesPage() {
	const {
		data: templates,
		isPending,
		error,
	} = useQuery(convexQuery(api.notificationTemplates.list, {}));
	const updateTemplate = useMutation(api.notificationTemplates.update);
	const removeTemplate = useMutation(api.notificationTemplates.remove);
	const [pendingId, setPendingId] = useState<string | null>(null);

	const toggleActive = async (id: string, currentActive: boolean) => {
		setPendingId(id);
		try {
			await updateTemplate({
				templateId: id as Id<"notificationTemplates">,
				isActive: !currentActive,
			});
			toast.success(currentActive ? "Template disabled" : "Template enabled");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPendingId(null);
		}
	};
	const onDelete = async (id: string, label: string) => {
		if (
			!window.confirm(
				`Delete notification template "${label}"? Booking reminders and confirmations will stop sending for this template type.`,
			)
		) {
			return;
		}
		setPendingId(id);
		try {
			await removeTemplate({ templateId: id as Id<"notificationTemplates"> });
			toast.success("Template deleted");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPendingId(null);
		}
	};

	const columns: DataTableColumn<NotificationTemplate>[] = [
		{
			key: "name",
			header: "Name",
			render: (t) => (
				<Link
					to="/dashboard/notifications/$templateId"
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
			render: (t) => (
				<span className="font-mono text-xs">{t.templateType}</span>
			),
			searchValue: (t) => t.templateType,
		},
		{
			key: "channel",
			header: "Channel",
			render: (t) => <StatusBadge status={t.channel} />,
			searchValue: (t) => t.channel,
		},
		{
			key: "subject",
			header: "Subject",
			render: (t) => (
				<span className="max-w-[300px] truncate inline-block">
					{t.emailSubject}
				</span>
			),
			searchValue: (t) => t.emailSubject,
		},
		{
			key: "timing",
			header: "Timing",
			render: (t) => <span className="font-mono text-xs">{t.sendTiming}</span>,
			searchValue: (t) => t.sendTiming,
		},
		{ key: "retries", header: "Retries", render: (t) => t.retryCount },
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
		<>
			<ListPage
				title="Notification templates"
				description={`${itemCount} template${itemCount === 1 ? "" : "s"} — these control which messages go out for booking events.`}
				newTo="/dashboard/notifications/new"
				newLabel="+ New template"
				actions={
					<Button asChild variant="outline">
						<Link to="/dashboard/notifications/settings">Settings</Link>
					</Button>
				}
			>
				<DataTable
					data={templates as NotificationTemplate[] | undefined}
					columns={columns}
					rowKey={(t) => t._id}
					isPending={isPending}
					error={error}
					emptyMessage="No notification templates yet."
					emptyAction={
						<Button asChild size="sm">
							<Link to="/dashboard/notifications/new">
								Create a booking message
							</Link>
						</Button>
					}
					searchPlaceholder="Search by name, type, subject, or status…"
				/>
			</ListPage>

			<DeliveryLogsSection />
		</>
	);
}

function DeliveryLogsSection() {
	const { data: logs, isPending } = useQuery(
		convexQuery(api.notifications.listRecentLogs, { limit: 30 }),
	);

	return (
		<section className="mt-10 space-y-3">
			<div>
				<h2 className="text-lg font-semibold">Recent deliveries</h2>
				<p className="text-muted-foreground text-sm">
					Email and SMS attempts for this organization
				</p>
			</div>
			{isPending ? (
				<p className="text-muted-foreground text-sm">Loading…</p>
			) : !logs || logs.length === 0 ? (
				<p className="text-muted-foreground text-sm">No deliveries yet.</p>
			) : (
				<ul className="divide-y rounded-md border">
					{logs.map((log) => (
						<li
							key={log._id}
							className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
						>
							<div className="min-w-0">
								<p className="font-medium truncate">
									{log.templateName} · {log.channel}
								</p>
								<p className="text-muted-foreground text-xs truncate">
									{log.recipient}
									{log.errorMessage ? ` — ${log.errorMessage}` : ""}
								</p>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								<StatusBadge status={log.status} />
								<span className="text-muted-foreground text-xs font-mono">
									{new Date(log.sentAt ?? log.createdAt).toLocaleString()}
								</span>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
