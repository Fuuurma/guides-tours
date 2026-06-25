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
	{ key: "name", header: "Name", render: (t) => t.name, className: "font-medium" },
	{
		key: "type",
		header: "Type",
		render: (t) => (
			<span className="font-mono text-xs">{t.templateType}</span>
		),
	},
	{
		key: "channel",
		header: "Channel",
		render: (t) => (
			<Badge className={channelColors[t.channel] ?? ""} variant="secondary">
				{t.channel}
			</Badge>
		),
	},
	{
		key: "subject",
		header: "Subject",
		render: (t) => (
			<span className="max-w-[300px] truncate inline-block">{t.emailSubject}</span>
		),
	},
	{
		key: "timing",
		header: "Timing",
		render: (t) => <span className="font-mono text-xs">{t.sendTiming}</span>,
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
				<CardHeader>
					<CardTitle>Notification templates</CardTitle>
					<CardDescription>
						{itemCount} template{itemCount === 1 ? "" : "s"} — these
						control which messages go out for booking events.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<DataTable
						data={templates as NotificationTemplate[] | undefined}
						columns={columns}
						rowKey={(t) => t._id}
						isPending={isPending}
						error={error}
						emptyMessage="No notification templates yet."
					/>
				</CardContent>
			</Card>
		</div>
	);
}