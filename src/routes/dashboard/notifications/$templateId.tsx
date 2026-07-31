import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage, getSafeDisplayMessage } from "@/lib/utils";
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
	const sendTest = useMutation(api.notificationTemplates.sendTest);
	const updateTemplate = useMutation(api.notificationTemplates.update);
	const [testTo, setTestTo] = useState("");
	const [testChannel, setTestChannel] = useState<"email" | "sms">("email");
	const [pending, setPending] = useState(false);
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState("");
	const [emailSubject, setEmailSubject] = useState("");
	const [emailBodyText, setEmailBodyText] = useState("");
	const [emailBodyHtml, setEmailBodyHtml] = useState("");
	const [smsBody, setSmsBody] = useState("");
	const [isActive, setIsActive] = useState(true);

	useEffect(() => {
		if (!template) return;
		setName(template.name);
		setEmailSubject(template.emailSubject);
		setEmailBodyText(template.emailBodyText);
		setEmailBodyHtml(template.emailBodyHtml ?? "");
		setSmsBody(template.smsBody ?? "");
		setIsActive(template.isActive);
	}, [template]);

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

	const onSendTest = async () => {
		if (!testTo.trim()) {
			toast.error(
				testChannel === "email"
					? "Enter an email address"
					: "Enter a phone number",
			);
			return;
		}
		setPending(true);
		try {
			await sendTest({
				templateId: template._id,
				channel: testChannel,
				to: testTo.trim(),
			});
			toast.success("Test send queued — check Recent deliveries shortly");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(false);
		}
	};

	const onSave = async () => {
		setPending(true);
		try {
			await updateTemplate({
				templateId: template._id,
				name: name.trim(),
				emailSubject: emailSubject.trim(),
				emailBodyText,
				emailBodyHtml: emailBodyHtml.trim() || undefined,
				smsBody: smsBody.trim() || undefined,
				isActive,
			});
			toast.success("Template saved");
			setEditing(false);
			await refetch();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(false);
		}
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
						<Button onClick={onSave} disabled={pending}>
							{pending ? "Saving…" : "Save"}
						</Button>
					</>
				) : (
					<Button variant="outline" onClick={() => setEditing(true)}>
						Edit
					</Button>
				)
			}
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

			{editing ? (
				<DetailSection title="Edit content">
					<div className="space-y-4">
						<div className="space-y-1">
							<Label htmlFor="tpl-name">Name</Label>
							<Input
								id="tpl-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								maxLength={100}
							/>
						</div>
						<div className="flex items-center gap-2">
							<input
								id="tpl-active"
								type="checkbox"
								checked={isActive}
								onChange={(e) => setIsActive(e.target.checked)}
								className="size-4"
							/>
							<Label htmlFor="tpl-active">Active</Label>
						</div>
						<div className="space-y-1">
							<Label htmlFor="tpl-subject">Email subject</Label>
							<Input
								id="tpl-subject"
								value={emailSubject}
								onChange={(e) => setEmailSubject(e.target.value)}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="tpl-text">Email body (text)</Label>
							<Textarea
								id="tpl-text"
								value={emailBodyText}
								onChange={(e) => setEmailBodyText(e.target.value)}
								rows={8}
								className="font-mono text-sm"
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="tpl-html">Email body (HTML)</Label>
							<Textarea
								id="tpl-html"
								value={emailBodyHtml}
								onChange={(e) => setEmailBodyHtml(e.target.value)}
								rows={6}
								className="font-mono text-xs"
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="tpl-sms">SMS body</Label>
							<Textarea
								id="tpl-sms"
								value={smsBody}
								onChange={(e) => setSmsBody(e.target.value)}
								rows={3}
								maxLength={320}
							/>
							<p className="text-muted-foreground text-xs">
								{smsBody.length} / 160 chars (SMS may segment over 160)
							</p>
						</div>
					</div>
				</DetailSection>
			) : null}

			<DetailSection
				title="Live preview"
				description="Rendered with sample booking placeholders"
			>
				{preview ? (
					<div className="space-y-3">
						<p className="text-muted-foreground text-xs">
							{preview.vars.customerName} · {preview.vars.tourName} ·{" "}
							{preview.vars.date} {preview.vars.startTime}
						</p>
						<div>
							<p className="text-muted-foreground text-sm">Subject</p>
							<p className="text-sm font-medium">{preview.rendered.subject}</p>
						</div>
						<div>
							<p className="text-muted-foreground text-sm">Email body</p>
							<pre className="text-sm whitespace-pre-wrap font-mono bg-muted p-3 rounded-md mt-1">
								{preview.rendered.bodyText}
							</pre>
						</div>
						{preview.rendered.bodyHtml ? (
							<div>
								<p className="text-muted-foreground text-sm">HTML preview</p>
								<iframe
									title="Email HTML preview"
									sandbox=""
									srcDoc={preview.rendered.bodyHtml}
									className="mt-1 h-48 w-full rounded-md border bg-white"
								/>
							</div>
						) : null}
						{(template.smsBody || preview.rendered.smsBody) && (
							<div>
								<p className="text-muted-foreground text-sm">SMS</p>
								<p className="text-sm whitespace-pre-wrap mt-1">
									{preview.rendered.smsBody}
								</p>
								<p className="text-muted-foreground text-xs mt-1">
									{preview.rendered.smsBody.length} chars
								</p>
							</div>
						)}
					</div>
				) : (
					<p className="text-muted-foreground text-sm">Loading preview…</p>
				)}
			</DetailSection>

			<DetailSection
				title="Send test"
				description="Deliver a real test via SES / Twilio (appears in Recent deliveries)"
			>
				<div className="flex flex-wrap gap-3 items-end">
					<div className="space-y-1">
						<label htmlFor="test-channel" className="text-sm font-medium">
							Channel
						</label>
						<select
							id="test-channel"
							className="border-input bg-background flex h-9 rounded-md border px-3 text-sm"
							value={testChannel}
							onChange={(e) =>
								setTestChannel(e.target.value as "email" | "sms")
							}
						>
							<option value="email">Email</option>
							<option value="sms">SMS</option>
						</select>
					</div>
					<div className="space-y-1 flex-1 min-w-[12rem]">
						<label htmlFor="test-to" className="text-sm font-medium">
							{testChannel === "email" ? "Email" : "Phone"}
						</label>
						<Input
							id="test-to"
							type={testChannel === "email" ? "email" : "tel"}
							value={testTo}
							onChange={(e) => setTestTo(e.target.value)}
							placeholder={
								testChannel === "email" ? "you@example.com" : "+15551234567"
							}
						/>
					</div>
					<Button type="button" onClick={onSendTest} disabled={pending}>
						{pending ? "Sending…" : "Send test"}
					</Button>
				</div>
			</DetailSection>

			{!editing && (
				<>
					<DetailSection title="Raw email content">
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
						<DetailSection title="Raw SMS content">
							<p className="text-sm whitespace-pre-wrap">{template.smsBody}</p>
							<p className="text-muted-foreground text-xs mt-2">
								{template.smsBody.length} / 160 chars
							</p>
						</DetailSection>
					)}
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
