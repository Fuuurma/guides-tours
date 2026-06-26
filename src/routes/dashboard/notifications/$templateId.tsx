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
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/notifications/$templateId")({
	component: NotificationTemplateDetailPage,
});

const channelColors: Record<string, string> = {
	email: "bg-blue-100 text-blue-800",
	sms: "bg-green-100 text-green-800",
	both: "bg-purple-100 text-purple-800",
};

function NotificationTemplateDetailPage() {
	const { templateId } = Route.useParams();
	const { data: template, isPending, error } = useQuery(
		convexQuery(api.notificationTemplates.get, {
			templateId: templateId as never,
		}),
	);

	if (isPending) {
		return <p className="text-muted-foreground">Loading...</p>;
	}
	if (error) {
		return (
			<p className="text-destructive text-sm">Error: {error.message}</p>
		);
	}
	if (!template) {
		return (
			<div className="space-y-4">
				<p className="text-muted-foreground">Template not found.</p>
				<Button asChild variant="outline">
					<Link to="/dashboard/notifications">← Back to templates</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">{template.name}</h1>
					<p className="text-muted-foreground text-sm font-mono">
						{template.templateType}
					</p>
				</div>
				<div className="flex gap-2">
					<Button asChild variant="outline">
						<Link to="/dashboard/notifications">← Back</Link>
					</Button>
				</div>
			</header>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Metric
					label="Channel"
					customBadge={
						<Badge
							className={channelColors[template.channel] ?? ""}
							variant="secondary"
						>
							{template.channel}
						</Badge>
					}
				/>
				<Metric label="Send timing" value={template.sendTiming} mono />
				<Metric label="Retries" value={template.retryCount.toString()} />
				<Metric
					label="Status"
					customBadge={
						template.isActive ? (
							<Badge>Active</Badge>
						) : (
							<Badge variant="secondary">Inactive</Badge>
						)
					}
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Email content</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div>
						<p className="text-muted-foreground text-sm">Subject</p>
						<p className="text-sm font-medium">{template.emailSubject}</p>
					</div>
					<div>
						<p className="text-muted-foreground text-sm">Body (text)</p>
						<pre className="text-sm whitespace-pre-wrap font-mono bg-muted p-3 rounded-md mt-1">
							{template.emailBodyText}
						</pre>
					</div>
					{template.emailBodyHtml && (
						<div>
							<p className="text-muted-foreground text-sm">Body (HTML)</p>
							<pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-3 rounded-md mt-1 max-h-[200px] overflow-auto">
								{template.emailBodyHtml}
							</pre>
						</div>
					)}
				</CardContent>
			</Card>

			{template.smsBody && (
				<Card>
					<CardHeader>
						<CardTitle>SMS content</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm whitespace-pre-wrap">{template.smsBody}</p>
						<p className="text-muted-foreground text-xs mt-2">
							{template.smsBody.length} / 160 chars
						</p>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Settings</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<Row
						label="Default"
						value={template.isDefault ? "Yes" : "No"}
					/>
					<Row
						label="Requires consent"
						value={template.requireConsent ? "Yes" : "No"}
					/>
					<Row
						label="Retry on failure"
						value={template.retryOnFailure ? "Yes" : "No"}
					/>
					{template.variables.length > 0 && (
						<div>
							<p className="text-muted-foreground mb-1">Variables</p>
							<div className="flex flex-wrap gap-1">
								{template.variables.map((v) => (
									<Badge key={v} variant="secondary">
										{v}
									</Badge>
								))}
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function Metric({
	label,
	value,
	mono,
	customBadge,
}: {
	label: string;
	value?: string;
	mono?: boolean;
	customBadge?: React.ReactNode;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardDescription>{label}</CardDescription>
			</CardHeader>
			<CardContent>
				{customBadge ??
					(mono ? (
						<p className="font-mono text-sm">{value}</p>
					) : (
						<p className="text-2xl font-semibold">{value}</p>
					))}
			</CardContent>
		</Card>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<span className="text-muted-foreground">{label}</span>
			<span>{value}</span>
		</div>
	);
}
