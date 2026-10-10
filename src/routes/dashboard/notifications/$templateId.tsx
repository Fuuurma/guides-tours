import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { getSafeDisplayMessage } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/notifications/$templateId")({
	component: NotificationTemplateDetailPage,
});

import {
	type PreviewRow,
	type TemplateRow,
	useTemplateEditForm,
	useTemplateTestForm,
} from "@/components/pages/notification-template-form";
import {
	TemplateEditFields,
	TemplatePreviewSection,
	TemplateTestFields,
} from "@/components/pages/notification-template-sections";

function NotificationTemplateDetailPage() {
	const { templateId } = Route.useParams();
	const {
		data: template,
		isPending,
		error,
		refetch,
	} = useQuery(
		convexQuery(api.notificationTemplates.get, {
			templateId: templateId as Id<"notificationTemplates">,
		}),
	);
	const { data: preview } = useQuery(
		convexQuery(api.notificationTemplates.preview, {
			templateId: templateId as Id<"notificationTemplates">,
		}),
	);

	if (isPending) {
		return <DetailSkeleton />;
	}
	if (error) return <ErrorBanner message={getSafeDisplayMessage(error)} />;
	if (!template) {
		return (
			<DetailPage
				title="Template not found"
				backTo="/dashboard/notifications"
			/>
		);
	}

	return (
		<NotificationTemplateBody
			template={template}
			preview={preview}
			onSaved={() => void refetch()}
		/>
	);
}
function NotificationTemplateBody({
	template,
	preview,
	onSaved,
}: {
	template: TemplateRow;
	preview: PreviewRow | undefined;
	onSaved: () => void;
}) {
	const sendTest = useMutation(api.notificationTemplates.sendTest);
	const updateTemplate = useMutation(api.notificationTemplates.update);
	const [editing, setEditing] = useState(false);
	const [saveErr, setSaveErr] = useState<string | null>(null);
	const [testErr, setTestErr] = useState<string | null>(null);

	const editForm = useTemplateEditForm({
		template,
		updateTemplate: (args) => updateTemplate(args),
		onSaved: () => {
			setEditing(false);
			onSaved();
		},
		onSaveError: setSaveErr,
	});

	const testForm = useTemplateTestForm({
		template,
		sendTest: (args) => sendTest(args),
		onTestError: setTestErr,
	});

	const beginEdit = () => {
		editForm.reset({
			name: template.name,
			isActive: template.isActive,
			emailSubject: template.emailSubject,
			emailBodyText: template.emailBodyText,
			emailBodyHtml: template.emailBodyHtml ?? "",
			smsBody: template.smsBody ?? "",
		});
		setSaveErr(null);
		setEditing(true);
	};

	return (
		<DetailPage
			title={template.name}
			subtitle={template.templateType}
			backTo="/dashboard/notifications"
			actions={
				editing ? (
					<>
						<Button variant="outline" onClick={() => setEditing(false)}>
							Cancel
						</Button>
						<editForm.Subscribe
							selector={(state) =>
								[state.canSubmit, state.isSubmitting] as const
							}
						>
							{([canSubmit, isSubmitting]) => (
								<Button
									onClick={() => void editForm.handleSubmit()}
									disabled={!canSubmit || isSubmitting}
								>
									{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
									{isSubmitting ? "Saving…" : "Save"}
								</Button>
							)}
						</editForm.Subscribe>
					</>
				) : (
					<Button variant="outline" onClick={beginEdit}>
						Edit
					</Button>
				)
			}
		>
			{/* F119: channel leads the notification-template row */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
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

			{editing ? (
				<DetailSection title="Edit content">
					<TemplateEditFields form={editForm} saveErr={saveErr} />
				</DetailSection>
			) : null}

			<DetailSection
				title="Live preview"
				description="Rendered with sample booking placeholders"
			>
				<TemplatePreviewSection template={template} preview={preview} />
			</DetailSection>

			<DetailSection
				title="Send test"
				description="Deliver a real test via SES / Twilio (appears in Recent deliveries)"
			>
				<TemplateTestFields form={testForm} testErr={testErr} />
			</DetailSection>

			{editing ? null : (
				<>
					<DetailSection title="Raw email content">
						<div>
							<p className="text-muted-foreground text-sm">Subject</p>
							<p className="text-sm font-medium">{template.emailSubject}</p>
						</div>
						<div>
							<p className="text-muted-foreground text-sm">Body (text)</p>
							<pre className="mt-1 rounded-md bg-muted p-3 font-mono text-sm whitespace-pre-wrap">
								{template.emailBodyText}
							</pre>
						</div>
						{template.emailBodyHtml ? (
							<div>
								<p className="text-muted-foreground text-sm">Body (HTML)</p>
								<pre className="mt-1 max-h-[200px] overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
									{template.emailBodyHtml}
								</pre>
							</div>
						) : null}
					</DetailSection>

					{template.smsBody ? (
						<DetailSection title="Raw SMS content">
							<p className="text-sm whitespace-pre-wrap">{template.smsBody}</p>
							<p className="mt-2 text-muted-foreground text-xs">
								{template.smsBody.length} / 160 chars
							</p>
						</DetailSection>
					) : null}
				</>
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
				{template.variables.length > 0 ? (
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
				) : null}
			</DetailSection>
		</DetailPage>
	);
}
