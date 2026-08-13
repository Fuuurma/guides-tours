import { useForm, useStore } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { PageBackLink } from "@/components/detail-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getErrorMessage } from "@/lib/utils";
import {
	MAX_EMAIL_SUBJECT_LEN,
	MAX_NAME_LEN,
	MAX_SMS_BODY_LEN,
	validateName,
	validateNonNegativeNumber,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";

const TEMPLATE_TYPES = [
	"booking_confirmation",
	"reminder_24h",
	"reminder_2h",
	"reminder_1h",
	"post_tour_review",
	"booking_cancelled",
	"booking_modified",
	"payment_received",
	"payment_failed",
	"custom",
] as const;
const CHANNELS = ["email", "sms", "both"] as const;
const SEND_TIMINGS = [
	"immediate",
	"24h_before",
	"2h_before",
	"1h_before",
	"post_tour",
	"custom",
] as const;

type NotifyValues = {
	name: string;
	templateType: string;
	channel: string;
	emailSubject: string;
	emailBodyText: string;
	smsBody: string;
	sendTiming: string;
	retryCount: string;
};

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

export function NewNotificationTemplatePage() {
	const navigate = useNavigate();
	const create = useMutation(api.notificationTemplates.create);
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			name: "",
			templateType: "booking_confirmation",
			channel: "email",
			emailSubject: "",
			emailBodyText: "",
			smsBody: "",
			sendTiming: "immediate",
			retryCount: "3",
		} satisfies NotifyValues,
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (name: keyof NotifyValues, message: string) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};

			const nameErr = validateName(value.name);
			if (nameErr) fail("name", nameErr);
			const wantsEmail = value.channel === "email" || value.channel === "both";
			const wantsSms = value.channel === "sms" || value.channel === "both";
			if (wantsEmail && !value.emailSubject.trim()) {
				fail("emailSubject", "Email subject is required");
			}
			if (wantsEmail && !value.emailBodyText.trim()) {
				fail("emailBodyText", "Email body is required");
			}
			if (wantsSms && !value.smsBody.trim()) {
				fail("smsBody", "SMS body is required");
			}
			const retriesErr = validateNonNegativeNumber(value.retryCount, "Retries");
			if (retriesErr) fail("retryCount", retriesErr);
			if (invalid) return;

			try {
				const id = await create({
					name: value.name.trim(),
					templateType: value.templateType,
					channel: value.channel,
					emailSubject: value.emailSubject.trim(),
					emailBodyText: value.emailBodyText.trim(),
					smsBody: value.smsBody.trim() || undefined,
					sendTiming: value.sendTiming,
					retryCount: Number(value.retryCount),
				});
				toast.success("Notification template created");
				void navigate({
					to: "/dashboard/notifications/$templateId",
					params: { templateId: id },
				});
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
			}
		},
	});

	const channel = useStore(form.store, (s) => s.values.channel);
	const wantsEmail = channel === "email" || channel === "both";
	const wantsSms = channel === "sms" || channel === "both";

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<div>
				<PageBackLink to="/dashboard/notifications" />
				<h1 className="mt-2 text-2xl font-semibold tracking-tight">
					New notification template
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Copy sent when a booking is confirmed, reminded, or cancelled.
				</p>
			</div>
			<Card>
				<CardContent className="pt-6">
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
										<FieldLabel htmlFor="name">Name *</FieldLabel>
										<Input
											id="name"
											required
											maxLength={MAX_NAME_LEN}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="Booking confirmation"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<form.Field name="templateType">
								{(field) => (
									<Field>
										<FieldLabel htmlFor="type">Template type</FieldLabel>
										<Select
											value={field.state.value}
											onValueChange={(v) => field.handleChange(v)}
										>
											<SelectTrigger id="type">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{TEMPLATE_TYPES.map((t) => (
														<SelectItem key={t} value={t}>
															{t.replaceAll("_", " ")}
														</SelectItem>
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
									</Field>
								)}
							</form.Field>

							<form.Field name="channel">
								{(field) => (
									<Field>
										<FieldLabel htmlFor="channel">Channel</FieldLabel>
										<ToggleGroup
											id="channel"
											type="single"
											variant="outline"
											size="sm"
											value={field.state.value}
											onValueChange={(v) => {
												if (v) field.handleChange(v);
											}}
										>
											{CHANNELS.map((c) => (
												<ToggleGroupItem key={c} value={c}>
													{c}
												</ToggleGroupItem>
											))}
										</ToggleGroup>
									</Field>
								)}
							</form.Field>

							{wantsEmail ? (
								<>
									<form.Field name="emailSubject">
										{(field) => (
											<Field data-invalid={!field.state.meta.isValid}>
												<FieldLabel htmlFor="subject">
													Email subject *
												</FieldLabel>
												<Input
													id="subject"
													required
													maxLength={MAX_EMAIL_SUBJECT_LEN}
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
													placeholder="Your booking is confirmed"
													aria-invalid={!field.state.meta.isValid}
												/>
												<FieldError
													errors={metaErrors(field.state.meta.errors)}
												/>
											</Field>
										)}
									</form.Field>
									<form.Field name="emailBodyText">
										{(field) => (
											<Field data-invalid={!field.state.meta.isValid}>
												<FieldLabel htmlFor="body">
													Email body (text) *
												</FieldLabel>
												<Textarea
													id="body"
													required
													maxLength={10000}
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
													rows={6}
													className="font-mono"
													aria-invalid={!field.state.meta.isValid}
												/>
												<FieldDescription>
													{
														"Plain text — variables like {customerName}, {tourName}, {date}"
													}
												</FieldDescription>
												<FieldError
													errors={metaErrors(field.state.meta.errors)}
												/>
											</Field>
										)}
									</form.Field>
								</>
							) : null}

							{wantsSms ? (
								<form.Field name="smsBody">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="sms">SMS body *</FieldLabel>
											<Textarea
												id="sms"
												maxLength={MAX_SMS_BODY_LEN}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												rows={3}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldDescription>
												Plain text — keep under 160 characters when possible.
											</FieldDescription>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
							) : null}

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<form.Field name="sendTiming">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="timing">Send timing</FieldLabel>
											<Select
												value={field.state.value}
												onValueChange={(v) => field.handleChange(v)}
											>
												<SelectTrigger id="timing">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														{SEND_TIMINGS.map((s) => (
															<SelectItem key={s} value={s}>
																{s.replaceAll("_", " ")}
															</SelectItem>
														))}
													</SelectGroup>
												</SelectContent>
											</Select>
										</Field>
									)}
								</form.Field>
								<form.Field name="retryCount">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="retries">Retries</FieldLabel>
											<Input
												id="retries"
												type="number"
												min="0"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							{submitErr ? <ErrorBanner message={submitErr} /> : null}

							<form.Subscribe
								selector={(state) =>
									[state.canSubmit, state.isSubmitting] as const
								}
							>
								{([canSubmit, isSubmitting]) => (
									<div className="flex justify-end gap-2 pt-2">
										<Button type="button" variant="outline" asChild>
											<Link to="/dashboard/notifications">Back</Link>
										</Button>
										<Button type="submit" disabled={!canSubmit || isSubmitting}>
											{isSubmitting ? (
												<Spinner data-icon="inline-start" />
											) : null}
											{isSubmitting ? "Saving…" : "Create template"}
										</Button>
									</div>
								)}
							</form.Subscribe>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
