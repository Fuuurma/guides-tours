import { convexQuery } from "@convex-dev/react-query";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { toast } from "sonner";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getErrorMessage, getSafeDisplayMessage } from "@/lib/utils";
import {
	MAX_EMAIL_SUBJECT_LEN,
	MAX_NAME_LEN,
	MAX_SMS_BODY_LEN,
	validateEmail,
	validateName,
} from "@/lib/validation";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/notifications/$templateId")({
	component: NotificationTemplateDetailPage,
});

type TemplateRow = NonNullable<
	FunctionReturnType<typeof api.notificationTemplates.get>
>;
type PreviewRow = FunctionReturnType<typeof api.notificationTemplates.preview>;

function metaErrors(
	errors: ReadonlyArray<unknown>,
): Array<{ message?: string }> {
	return errors.map((err) => {
		if (typeof err === "string") return { message: err };
		if (err && typeof err === "object" && "message" in err) {
			const message = (err as { message?: unknown }).message;
			if (typeof message === "string") return { message };
		}
		return { message: String(err) };
	});
}

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

	const editForm = useForm({
		defaultValues: {
			name: template.name,
			isActive: template.isActive,
			emailSubject: template.emailSubject,
			emailBodyText: template.emailBodyText,
			emailBodyHtml: template.emailBodyHtml ?? "",
			smsBody: template.smsBody ?? "",
		},
		onSubmit: async ({ value }) => {
			setSaveErr(null);
			const nameErr = validateName(value.name);
			if (nameErr) {
				editForm.setFieldMeta("name", (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: nameErr },
				}));
				return;
			}
			try {
				await updateTemplate({
					templateId: template._id,
					name: value.name.trim(),
					emailSubject: value.emailSubject.trim(),
					emailBodyText: value.emailBodyText,
					emailBodyHtml: value.emailBodyHtml.trim() || undefined,
					smsBody: value.smsBody.trim() || undefined,
					isActive: value.isActive,
				});
				toast.success("Template saved");
				setEditing(false);
				onSaved();
			} catch (err) {
				setSaveErr(getErrorMessage(err));
			}
		},
	});

	const testForm = useForm({
		defaultValues: {
			channel: "email" as "email" | "sms",
			to: "",
		},
		onSubmit: async ({ value }) => {
			setTestErr(null);
			const to = value.to.trim();
			if (!to) {
				testForm.setFieldMeta("to", (prev) => ({
					...prev,
					errorMap: {
						...prev.errorMap,
						onSubmit:
							value.channel === "email"
								? "Enter an email address"
								: "Enter a phone number",
					},
				}));
				return;
			}
			if (value.channel === "email") {
				const emailErr = validateEmail(to);
				if (emailErr) {
					testForm.setFieldMeta("to", (prev) => ({
						...prev,
						errorMap: { ...prev.errorMap, onSubmit: emailErr },
					}));
					return;
				}
			}
			try {
				await sendTest({
					templateId: template._id,
					channel: value.channel,
					to,
				});
				toast.success("Test send queued — check Recent deliveries shortly");
			} catch (err) {
				setTestErr(getErrorMessage(err));
			}
		},
	});

	const testChannel = useStore(testForm.store, (s) => s.values.channel);

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
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							void editForm.handleSubmit();
						}}
					>
						<FieldGroup className="gap-4">
							<editForm.Field name="name">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="tpl-name">Name</FieldLabel>
										<Input
											id="tpl-name"
											maxLength={MAX_NAME_LEN}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</editForm.Field>
							<editForm.Field name="isActive">
								{(field) => (
									<Field orientation="horizontal">
										<FieldLabel htmlFor="tpl-active">Active</FieldLabel>
										<Switch
											id="tpl-active"
											checked={field.state.value}
											onCheckedChange={field.handleChange}
										/>
									</Field>
								)}
							</editForm.Field>
							<editForm.Field name="emailSubject">
								{(field) => (
									<Field>
										<FieldLabel htmlFor="tpl-subject">Email subject</FieldLabel>
										<Input
											id="tpl-subject"
											maxLength={MAX_EMAIL_SUBJECT_LEN}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</Field>
								)}
							</editForm.Field>
							<editForm.Field name="emailBodyText">
								{(field) => (
									<Field>
										<FieldLabel htmlFor="tpl-text">
											Email body (text)
										</FieldLabel>
										<Textarea
											id="tpl-text"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											rows={8}
											className="font-mono text-sm"
										/>
									</Field>
								)}
							</editForm.Field>
							<editForm.Field name="emailBodyHtml">
								{(field) => (
									<Field>
										<FieldLabel htmlFor="tpl-html">
											Email body (HTML)
										</FieldLabel>
										<Textarea
											id="tpl-html"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											rows={6}
											className="font-mono text-xs"
										/>
									</Field>
								)}
							</editForm.Field>
							<editForm.Field name="smsBody">
								{(field) => (
									<Field>
										<FieldLabel htmlFor="tpl-sms">SMS body</FieldLabel>
										<Textarea
											id="tpl-sms"
											maxLength={MAX_SMS_BODY_LEN}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											rows={3}
										/>
										<FieldDescription>
											{field.state.value.length} / 160 chars (SMS may segment
											over 160)
										</FieldDescription>
									</Field>
								)}
							</editForm.Field>
							{saveErr ? <ErrorBanner message={saveErr} /> : null}
						</FieldGroup>
					</form>
				</DetailSection>
			) : null}

			<DetailSection
				title="Live preview"
				description="Rendered with sample booking placeholders"
			>
				{preview ? (
					<div className="flex flex-col gap-3">
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
							<pre className="mt-1 rounded-md bg-muted p-3 font-mono text-sm whitespace-pre-wrap">
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
						{template.smsBody || preview.rendered.smsBody ? (
							<div>
								<p className="text-muted-foreground text-sm">SMS</p>
								<p className="mt-1 text-sm whitespace-pre-wrap">
									{preview.rendered.smsBody}
								</p>
								<p className="mt-1 text-muted-foreground text-xs">
									{preview.rendered.smsBody.length} chars
								</p>
							</div>
						) : null}
					</div>
				) : (
					<p className="text-muted-foreground text-sm">Loading preview…</p>
				)}
			</DetailSection>

			<DetailSection
				title="Send test"
				description="Deliver a real test via SES / Twilio (appears in Recent deliveries)"
			>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void testForm.handleSubmit();
					}}
				>
					<FieldGroup className="flex flex-wrap items-end gap-3">
						<testForm.Field name="channel">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="test-channel">Channel</FieldLabel>
									<ToggleGroup
										id="test-channel"
										type="single"
										variant="outline"
										size="sm"
										value={field.state.value}
										onValueChange={(v) => {
											if (v === "email" || v === "sms") field.handleChange(v);
										}}
									>
										<ToggleGroupItem value="email">Email</ToggleGroupItem>
										<ToggleGroupItem value="sms">SMS</ToggleGroupItem>
									</ToggleGroup>
								</Field>
							)}
						</testForm.Field>
						<testForm.Field name="to">
							{(field) => (
								<Field
									className="min-w-[12rem] flex-1"
									data-invalid={!field.state.meta.isValid}
								>
									<FieldLabel htmlFor="test-to">
										{testChannel === "email" ? "Email" : "Phone"}
									</FieldLabel>
									<Input
										id="test-to"
										type={testChannel === "email" ? "email" : "tel"}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder={
											testChannel === "email"
												? "you@example.com"
												: "+15551234567"
										}
										aria-invalid={!field.state.meta.isValid}
									/>
									<FieldError errors={metaErrors(field.state.meta.errors)} />
								</Field>
							)}
						</testForm.Field>
						<testForm.Subscribe
							selector={(state) =>
								[state.canSubmit, state.isSubmitting] as const
							}
						>
							{([canSubmit, isSubmitting]) => (
								<Button type="submit" disabled={!canSubmit || isSubmitting}>
									{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
									{isSubmitting ? "Sending…" : "Send test"}
								</Button>
							)}
						</testForm.Subscribe>
					</FieldGroup>
					{testErr ? (
						<div className="mt-3">
							<ErrorBanner message={testErr} />
						</div>
					) : null}
				</form>
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
