import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/ui/error-banner";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/notifications/$templateId")({
	component: NotificationTemplateDetailPage,
});

function NotificationTemplateDetailPage() {
	const { templateId } = Route.useParams();
	const {
		data: template,
		isPending,
		error,
	} = useQuery(
		convexQuery(api.notificationTemplates.get, {
			templateId: templateId as Id<"notificationTemplates">,
		}),
	);

	if (isPending) {
		return <DetailSkeleton />;
	}
	if (error) return <ErrorBanner message={error.message} />;
	if (!template) {
		return (
			<DetailPage
				title="Template not found"
				backTo="/dashboard/notifications"
			/>
		);
	}

	return (
		<DetailPage
			title={template.name}
			subtitle={template.templateType}
			backTo="/dashboard/notifications"
		>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="Channel" value={template.channel}>
					<StatusBadge status={template.channel} />
				</MetricCard>
				<MetricCard label="Send timing" value={template.sendTiming} />
				<MetricCard label="Retries" value={template.retryCount.toString()} />
				<MetricCard
					label="Status"
					value={template.isActive ? "Active" : "Inactive"}
				>
					<StatusBadge status={template.isActive ? "active" : "inactive"} />
				</MetricCard>
			</div>

			<DetailSection title="Email content">
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
			</DetailSection>

			{template.smsBody && (
				<DetailSection title="SMS content">
					<p className="text-sm whitespace-pre-wrap">{template.smsBody}</p>
					<p className="text-muted-foreground text-xs mt-2">
						{template.smsBody.length} / 160 chars
					</p>
				</DetailSection>
			)}

			<DetailSection title="Settings">
				<DetailRow label="Default" value={template.isDefault ? "Yes" : "No"} />
				<DetailRow
					label="Requires consent"
					value={template.requireConsent ? "Yes" : "No"}
				/>
				<DetailRow
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
			</DetailSection>
		</DetailPage>
	);
}
