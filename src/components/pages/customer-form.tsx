import { useForm, useStore } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
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
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/utils";
import {
	MAX_EMAIL_LEN,
	MAX_NAME_LEN,
	MAX_NOTES_LEN,
	MAX_PHONE_LEN,
	validateEmail,
	validateName,
	validateNotesOptional,
	validatePhoneOptional,
} from "@/lib/validation";

export type CustomerFormValues = {
	name: string;
	email: string;
	phone: string;
	preferredLanguage: string;
	notes: string;
	vipStatus: boolean;
	emailConsent: boolean;
	smsConsent: boolean;
};

export const EMPTY_CUSTOMER_FORM: CustomerFormValues = {
	name: "",
	email: "",
	phone: "",
	preferredLanguage: "en",
	notes: "",
	vipStatus: false,
	emailConsent: false,
	smsConsent: false,
};

type CustomerDoc = {
	name: string;
	email: string;
	phone?: string;
	preferredLanguage?: string;
	notes?: string;
	vipStatus?: boolean;
	emailConsent?: boolean;
	smsConsent?: boolean;
};

export function customerDocToFormValues(
	customer: CustomerDoc,
): CustomerFormValues {
	return {
		name: customer.name,
		email: customer.email,
		phone: customer.phone ?? "",
		preferredLanguage: customer.preferredLanguage ?? "en",
		notes: customer.notes ?? "",
		vipStatus: Boolean(customer.vipStatus),
		emailConsent: customer.emailConsent === true,
		smsConsent: customer.smsConsent === true,
	};
}

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

export function CustomerForm({
	mode,
	defaultValues,
	title,
	description,
	backTo,
	submitLabel,
	idPrefix = "",
	onSave,
}: {
	mode: "create" | "edit";
	defaultValues: CustomerFormValues;
	title: string;
	description: string;
	backTo: string;
	submitLabel: string;
	idPrefix?: string;
	onSave: (value: CustomerFormValues) => Promise<void>;
}) {
	const id = (suffix: string) => `${idPrefix}${suffix}`;
	const emailConsentId =
		mode === "edit"
			? "edit-customer-email-consent"
			: "new-customer-email-consent";
	const smsConsentId =
		mode === "edit" ? "edit-customer-sms-consent" : "new-customer-sms-consent";
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (name: keyof CustomerFormValues, message: string) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};

			const nameErr = validateName(value.name);
			if (nameErr) fail("name", nameErr);
			const emailErr = validateEmail(value.email);
			if (emailErr) fail("email", emailErr);
			const phoneErr = validatePhoneOptional(value.phone);
			if (phoneErr) fail("phone", phoneErr);
			const notesErr = validateNotesOptional(value.notes);
			if (notesErr) fail("notes", notesErr);
			if (invalid) return;

			try {
				await onSave(value);
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
			}
		},
	});

	const notesLen = useStore(form.store, (s) => s.values.notes.length);

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<div>
				<PageBackLink to={backTo} />
				<h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
										<FieldLabel htmlFor={id("name")}>Name *</FieldLabel>
										<Input
											id={id("name")}
											required
											maxLength={MAX_NAME_LEN}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="Jane Doe"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<form.Field name="email">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor={id("email")}>Email *</FieldLabel>
										<Input
											id={id("email")}
											type="email"
											required
											maxLength={MAX_EMAIL_LEN}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="jane@example.com"
											autoComplete="email"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<form.Field name="phone">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor={id("phone")}>Phone</FieldLabel>
											<Input
												id={id("phone")}
												type="tel"
												maxLength={MAX_PHONE_LEN}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="+1 555 555 5555"
												autoComplete="tel"
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldDescription>
												Needed for SMS reminders if they opt in.
											</FieldDescription>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="preferredLanguage">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={id("lang")}>
												Preferred language
											</FieldLabel>
											<Input
												id={id("lang")}
												maxLength={10}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="en"
											/>
											<FieldDescription>
												ISO code used on confirmations, e.g. en or es.
											</FieldDescription>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							<form.Field name="notes">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor={id("notes")}>Notes</FieldLabel>
										<Textarea
											id={id("notes")}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											rows={3}
											maxLength={MAX_NOTES_LEN}
											placeholder="Allergies, pickup notes, repeat guest…"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldDescription>
											{notesLen} / {MAX_NOTES_LEN}
										</FieldDescription>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							{mode === "edit" ? (
								<form.Field name="vipStatus">
									{(field) => (
										<Field orientation="horizontal">
											<FieldLabel htmlFor={id("vip")}>VIP customer</FieldLabel>
											<Switch
												id={id("vip")}
												checked={field.state.value}
												onCheckedChange={(checked) =>
													field.handleChange(checked)
												}
											/>
											<FieldDescription>
												VIP is an operator flag — it does not change pricing.
											</FieldDescription>
										</Field>
									)}
								</form.Field>
							) : null}

							<FieldSet>
								<FieldLegend>Notifications</FieldLegend>
								<FieldDescription>
									Consent is opt-in. Leave these off unless they asked.
								</FieldDescription>
								<FieldGroup className="gap-4">
									<form.Field name="emailConsent">
										{(field) => (
											<Field orientation="horizontal">
												<FieldLabel htmlFor={emailConsentId}>
													Email updates & reminders
												</FieldLabel>
												<Switch
													id={emailConsentId}
													checked={field.state.value}
													onCheckedChange={(checked) =>
														field.handleChange(checked)
													}
												/>
											</Field>
										)}
									</form.Field>
									<form.Field name="smsConsent">
										{(field) => (
											<Field orientation="horizontal">
												<FieldLabel htmlFor={smsConsentId}>
													SMS reminders
												</FieldLabel>
												<Switch
													id={smsConsentId}
													checked={field.state.value}
													onCheckedChange={(checked) =>
														field.handleChange(checked)
													}
												/>
											</Field>
										)}
									</form.Field>
								</FieldGroup>
							</FieldSet>

							{submitErr ? <ErrorBanner message={submitErr} /> : null}

							<form.Subscribe
								selector={(state) =>
									[state.canSubmit, state.isSubmitting] as const
								}
							>
								{([canSubmit, isSubmitting]) => (
									<div className="flex justify-end gap-2 pt-2">
										<Button type="button" variant="outline" asChild>
											<Link to={backTo}>Back</Link>
										</Button>
										<Button type="submit" disabled={!canSubmit || isSubmitting}>
											{isSubmitting ? (
												<Spinner data-icon="inline-start" />
											) : null}
											{isSubmitting ? "Saving…" : submitLabel}
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
