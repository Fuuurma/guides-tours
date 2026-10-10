import { useStore } from "@tanstack/react-form";
import { DetailSection } from "@/components/detail-page";
import type {
	PreviewRow,
	TemplateEditFormApi,
	TemplateRow,
	TemplateTestFormApi,
} from "@/components/pages/notification-template-form";
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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	MAX_EMAIL_SUBJECT_LEN,
	MAX_NAME_LEN,
	MAX_SMS_BODY_LEN,
} from "@/lib/validation";

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

/**
 * The notification-template detail sections, split out of the route so the
 * body component stays under the giant-component line. Form sections
 * receive the TanStack form instance; the preview section is pure props.
 */
export function TemplateEditFields({
	form,
	saveErr,
}: {
	form: TemplateEditFormApi;
	saveErr: string | null;
}) {
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<FieldGroup className="gap-4">
					<form.Field name="name">
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
					</form.Field>
					<form.Field name="isActive">
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
					</form.Field>
					<form.Field name="emailSubject">
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
					</form.Field>
					<form.Field name="emailBodyText">
						{(field) => (
							<Field>
								<FieldLabel htmlFor="tpl-text">Email body (text)</FieldLabel>
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
					</form.Field>
					<form.Field name="emailBodyHtml">
						{(field) => (
							<Field>
								<FieldLabel htmlFor="tpl-html">Email body (HTML)</FieldLabel>
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
					</form.Field>
					<form.Field name="smsBody">
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
									{field.state.value.length} / 160 chars (SMS may segment over
									160)
								</FieldDescription>
							</Field>
						)}
					</form.Field>
					{saveErr ? <ErrorBanner message={saveErr} /> : null}
				</FieldGroup>
			</form>
		</form>
	);
}

export function TemplatePreviewSection({
	template,
	preview,
}: {
	template: TemplateRow;
	preview: PreviewRow | undefined;
}) {
	return (
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
	);
}

export function TemplateTestFields({
	form,
	testErr,
}: {
	form: TemplateTestFormApi;
	testErr: string | null;
}) {
	const testChannel = useStore(form.store, (s) => s.values.channel);
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<FieldGroup className="flex flex-wrap items-end gap-3">
				<form.Field name="channel">
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
				</form.Field>
				<form.Field name="to">
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
									testChannel === "email" ? "you@example.com" : "+15551234567"
								}
								aria-invalid={!field.state.meta.isValid}
							/>
							<FieldError errors={metaErrors(field.state.meta.errors)} />
						</Field>
					)}
				</form.Field>
				<form.Subscribe
					selector={(state) => [state.canSubmit, state.isSubmitting] as const}
				>
					{([canSubmit, isSubmitting]) => (
						<Button type="submit" disabled={!canSubmit || isSubmitting}>
							{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
							{isSubmitting ? "Sending…" : "Send test"}
						</Button>
					)}
				</form.Subscribe>
			</FieldGroup>
			{testErr ? (
				<div className="mt-3">
					<ErrorBanner message={testErr} />
				</div>
			) : null}
		</form>
	);
}
