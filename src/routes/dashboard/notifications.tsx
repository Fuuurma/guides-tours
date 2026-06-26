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

export const Route = createFileRoute("/dashboard/notifications")({
	component: NotificationTemplatesPage,
});

interface NotificationTemplate {
	_id: string;
	name: string;
	templateType: string;
	channel: string;
	emailSubject: string;
	isActive: boolean;
	sendTiming: string;
	retryCount: number;
}

const channelColors: Record<string, string> = {
	email: "bg-blue-100 text-blue-800",
	sms: "bg-green-100 text-green-800",
	both: "bg-purple-100 text-purple-800",
};

const columns: DataTableColumn<NotificationTemplate>[] = [
	{
		key: "name",
		header: "Name",
		render: (t) => (
			<Link
				to="/dashboard/notifications/$templateId"
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
		render: (t) => <span className="font-mono text-xs">{t.templateType}</span>,
		searchValue: (t) => t.templateType,
	},
	{
		key: "channel",
		header: "Channel",
		render: (t) => (
			<Badge className={channelColors[t.channel] ?? ""} variant="secondary">
				{t.channel}
			</Badge>
		),
		searchValue: (t) => t.channel,
	},
	{
		key: "subject",
		header: "Subject",
		render: (t) => (
			<span className="max-w-[300px] truncate inline-block">{t.emailSubject}</span>
		),
		searchValue: (t) => t.emailSubject,
	},
	{
		key: "timing",
		header: "Timing",
		render: (t) => <span className="font-mono text-xs">{t.sendTiming}</span>,
		searchValue: (t) => t.sendTiming,
	},
	{
		key: "retries",
		header: "Retries",
		render: (t) => t.retryCount,
	},
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

function NotificationTemplatesPage() {
	const { data: templates, isPending, error } = useQuery(
		convexQuery(api.notificationTemplates.list, {}),
	);

	const itemCount = templates?.length ?? 0;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<div>
						<CardTitle>Notification templates</CardTitle>
						<CardDescription>
							{itemCount} template{itemCount === 1 ? "" : "s"} — these
							control which messages go out for booking events.
						</CardDescription>
					</div>
					<div className="flex gap-2">
						<Button asChild variant="outline">
							<Link to="/dashboard/notifications/settings">Settings</Link>
						</Button>
						<Button asChild>
							<Link to="/dashboard/notifications/new">+ New template</Link>
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<DataTable
						data={templates as NotificationTemplate[] | undefined}
						columns={columns}
						rowKey={(t) => t._id}
						isPending={isPending}
						error={error}
						emptyMessage="No notification templates yet."
						searchPlaceholder="Search by name, type, subject, or status…"
					/>
				</CardContent>
			</Card>
		</div>
	);
}