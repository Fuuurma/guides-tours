import { convexQuery } from "@convex-dev/react-query";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import { getErrorMessage } from "@/lib/utils";
import {
	MAX_NAME_LEN,
	validateEmail,
	validateNonNegativeNumber,
	validatePhoneOptional,
	validatePositiveInteger,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";

interface Settings {
	_id: string;
	organizationId: string;
	twilioEnabled: boolean;
	twilioAccountSid: string;
	twilioPhoneNumber: string;
	twilioMessagingServiceSid: string;
	emailEnabled: boolean;
	emailFromName: string;
	emailFromEmail: string;
	useCompanyDefaults: boolean;
	requireSmsConsent: boolean;
	requireEmailConsent: boolean;
	maxRetries: number;
	retryDelayMinutes: number;
	staffingDigestEnabled?: boolean;
	staffingDigestEmail?: string;
	staffingDigestPhone?: string;
	staffingDigestDaysAhead?: number;
	availabilityReminderEnabled?: boolean;
	availabilityReminderDaysAhead?: number;
	assignmentNotifyEnabled?: boolean;
	phoneRemindWithDigest?: boolean;
}

type NotifFormValues = {
	emailEnabled: boolean;
	emailFromName: string;
	emailFromEmail: string;
	twilioEnabled: boolean;
	twilioAccountSid: string;
	twilioAuthToken: string;
	twilioPhoneNumber: string;
	twilioMessagingServiceSid: string;
	staffingDigestEnabled: boolean;
	staffingDigestEmail: string;
	staffingDigestPhone: string;
	staffingDigestDaysAhead: string;
	phoneRemindWithDigest: boolean;
	availabilityReminderEnabled: boolean;
	availabilityReminderDaysAhead: string;
	assignmentNotifyEnabled: boolean;
	maxRetries: string;
	retryDelayMinutes: string;
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

function daysAheadError(value: string, label: string): string | null {
	const err = validatePositiveInteger(value, label);
	if (err) return err;
	const n = Number(value);
	if (n < 1 || n > 14) return `${label} must be between 1 and 14`;
	return null;
}

export function NotificationSettingsPage() {
	const { data: settings, isPending } = useQuery(
		convexQuery(api.notificationSettings.get, {}),
	);

	if (isPending) {
		return <DetailSkeleton />;
	}

	return (
		<NotificationSettingsForm
			settings={(settings as Settings | null) ?? null}
		/>
	);
}

function NotificationSettingsForm({ settings }: { settings: Settings | null }) {
	const upsert = useMutation(api.notificationSettings.upsert);
	const sendDigestNow = useMutation(api.staffingDigest.sendNow);
	const sendAvailNow = useMutation(api.availabilityReminders.sendNow);
	const sendAssignTest = useMutation(api.assignmentNotifications.sendTest);

	const [submitErr, setSubmitErr] = useState<string | null>(null);
	const [digestPending, setDigestPending] = useState(false);
	const [availPending, setAvailPending] = useState(false);
	const [assignGuidePending, setAssignGuidePending] = useState(false);
	const [assignDriverPending, setAssignDriverPending] = useState(false);

	const form = useForm({
		defaultValues: {
			emailEnabled: settings?.emailEnabled ?? true,
			emailFromName: settings?.emailFromName ?? "",
			emailFromEmail: settings?.emailFromEmail ?? "",
			twilioEnabled: settings?.twilioEnabled ?? false,
			twilioAccountSid: settings?.twilioAccountSid ?? "",
			twilioAuthToken: "",
			twilioPhoneNumber: settings?.twilioPhoneNumber ?? "",
			twilioMessagingServiceSid: settings?.twilioMessagingServiceSid ?? "",
			staffingDigestEnabled: settings?.staffingDigestEnabled === true,
			staffingDigestEmail: settings?.staffingDigestEmail ?? "",
			staffingDigestPhone: settings?.staffingDigestPhone ?? "",
			staffingDigestDaysAhead: String(settings?.staffingDigestDaysAhead ?? 3),
			phoneRemindWithDigest: settings?.phoneRemindWithDigest === true,
			availabilityReminderEnabled:
				settings?.availabilityReminderEnabled === true,
			availabilityReminderDaysAhead: String(
				settings?.availabilityReminderDaysAhead ?? 7,
			),
			assignmentNotifyEnabled: settings?.assignmentNotifyEnabled !== false,
			maxRetries: String(settings?.maxRetries ?? 3),
			retryDelayMinutes: String(settings?.retryDelayMinutes ?? 15),
		} satisfies NotifFormValues,
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (name: keyof NotifFormValues, message: string) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};

			if (value.emailFromName.length > MAX_NAME_LEN) {
				fail("emailFromName", `From name is too long (max ${MAX_NAME_LEN})`);
			}
			if (value.emailFromEmail.trim()) {
				const emailErr = validateEmail(value.emailFromEmail);
				if (emailErr) fail("emailFromEmail", emailErr);
			}
			if (value.staffingDigestEmail.trim()) {
				const digestEmailErr = validateEmail(value.staffingDigestEmail);
				if (digestEmailErr) fail("staffingDigestEmail", digestEmailErr);
			}
			const phoneErr = validatePhoneOptional(value.twilioPhoneNumber);
			if (phoneErr) fail("twilioPhoneNumber", phoneErr);
			const digestPhoneErr = validatePhoneOptional(value.staffingDigestPhone);
			if (digestPhoneErr) fail("staffingDigestPhone", digestPhoneErr);

			const retriesErr = validateNonNegativeNumber(value.maxRetries, "Retries");
			if (retriesErr) fail("maxRetries", retriesErr);
			else if (!Number.isInteger(Number(value.maxRetries))) {
				fail("maxRetries", "Retries must be a whole number");
			}
			const delayErr = validateNonNegativeNumber(
				value.retryDelayMinutes,
				"Retry delay",
			);
			if (delayErr) fail("retryDelayMinutes", delayErr);

			const digestDaysErr = daysAheadError(
				value.staffingDigestDaysAhead,
				"Digest days ahead",
			);
			if (digestDaysErr) fail("staffingDigestDaysAhead", digestDaysErr);
			const availDaysErr = daysAheadError(
				value.availabilityReminderDaysAhead,
				"Availability reminder days ahead",
			);
			if (availDaysErr) fail("availabilityReminderDaysAhead", availDaysErr);
			if (invalid) return;

			try {
				await upsert({
					twilioEnabled: value.twilioEnabled,
					twilioAccountSid: value.twilioAccountSid || undefined,
					twilioAuthToken: value.twilioAuthToken || undefined,
					twilioPhoneNumber: value.twilioPhoneNumber || undefined,
					twilioMessagingServiceSid: value.twilioMessagingServiceSid,
					emailEnabled: value.emailEnabled,
					emailFromName: value.emailFromName || undefined,
					emailFromEmail: value.emailFromEmail || undefined,
					maxRetries: Number(value.maxRetries),
					retryDelayMinutes: Number(value.retryDelayMinutes),
					staffingDigestEnabled: value.staffingDigestEnabled,
					staffingDigestEmail: value.staffingDigestEmail,
					staffingDigestPhone: value.staffingDigestPhone,
					staffingDigestDaysAhead: Number(value.staffingDigestDaysAhead),
					availabilityReminderEnabled: value.availabilityReminderEnabled,
					availabilityReminderDaysAhead: Number(
						value.availabilityReminderDaysAhead,
					),
					assignmentNotifyEnabled: value.assignmentNotifyEnabled,
					phoneRemindWithDigest: value.phoneRemindWithDigest,
				});
				form.setFieldValue("twilioAuthToken", "");
				toast.success("Settings saved");
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
				toast.error(getErrorMessage(err));
			}
		},
	});

	const onSendDigest = async () => {
		setDigestPending(true);
		try {
			await sendDigestNow({ force: true });
			toast.success("Digest queued — check email/SMS shortly");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setDigestPending(false);
		}
	};

	const onSendAvail = async () => {
		setAvailPending(true);
		try {
			await sendAvailNow({ force: false });
			toast.success("Availability reminders queued for guides");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setAvailPending(false);
		}
	};

	const onSendAssignTest = async (role: "guide" | "driver") => {
		const setPending =
			role === "guide" ? setAssignGuidePending : setAssignDriverPending;
		setPending(true);
		try {
			await sendAssignTest({ role });
			toast.success(`Test ${role} notification queued — check your email/SMS`);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<header className="flex items-center justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold">Notification settings</h1>
					<p className="text-muted-foreground text-sm">
						Channel configuration and delivery preferences
					</p>
				</div>
				<Button asChild variant="outline">
					<Link to="/dashboard/notifications">← Back</Link>
				</Button>
			</header>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<FieldGroup className="gap-6">
					<Card>
						<CardHeader>
							<CardTitle>Email (SES)</CardTitle>
							<CardDescription>
								Outbound transactional email via AWS SES
							</CardDescription>
						</CardHeader>
						<CardContent>
							<FieldGroup className="gap-4">
								<form.Field name="emailEnabled">
									{(field) => (
										<Field orientation="horizontal">
											<FieldLabel htmlFor="email-enabled">
												Email channel enabled
											</FieldLabel>
											<Switch
												id="email-enabled"
												checked={field.state.value}
												onCheckedChange={field.handleChange}
											/>
										</Field>
									)}
								</form.Field>
								<FieldGroup className="grid gap-4 md:grid-cols-2">
									<form.Field name="emailFromName">
										{(field) => (
											<Field data-invalid={!field.state.meta.isValid}>
												<FieldLabel htmlFor="fromName">From name</FieldLabel>
												<Input
													id="fromName"
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
													placeholder="Tours Co."
													maxLength={MAX_NAME_LEN}
													aria-invalid={!field.state.meta.isValid}
												/>
												<FieldError
													errors={metaErrors(field.state.meta.errors)}
												/>
											</Field>
										)}
									</form.Field>
									<form.Field name="emailFromEmail">
										{(field) => (
											<Field data-invalid={!field.state.meta.isValid}>
												<FieldLabel htmlFor="fromEmail">From email</FieldLabel>
												<Input
													id="fromEmail"
													type="email"
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
													placeholder="bookings@tours.co"
													aria-invalid={!field.state.meta.isValid}
												/>
												<FieldError
													errors={metaErrors(field.state.meta.errors)}
												/>
											</Field>
										)}
									</form.Field>
								</FieldGroup>
							</FieldGroup>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>SMS (Twilio)</CardTitle>
							<CardDescription>Outbound SMS via Twilio</CardDescription>
						</CardHeader>
						<CardContent>
							<FieldGroup className="gap-4">
								<form.Field name="twilioEnabled">
									{(field) => (
										<Field orientation="horizontal">
											<FieldLabel htmlFor="twilio-enabled">
												Twilio channel enabled
											</FieldLabel>
											<Switch
												id="twilio-enabled"
												checked={field.state.value}
												onCheckedChange={field.handleChange}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="twilioAccountSid">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="sid">Account SID</FieldLabel>
											<Input
												id="sid"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="AC..."
												maxLength={100}
												autoComplete="off"
											/>
											<FieldDescription>
												Twilio account SID (starts with AC...)
											</FieldDescription>
										</Field>
									)}
								</form.Field>
								<form.Field name="twilioAuthToken">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="token">Auth token</FieldLabel>
											<div className="flex items-center gap-2">
												<Input
													id="token"
													type="password"
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
													placeholder={settings ? "•••••••" : "Enter token"}
													maxLength={500}
													autoComplete="off"
												/>
												{settings ? (
													<Badge variant="secondary">Token set</Badge>
												) : null}
											</div>
											<FieldDescription>
												{settings
													? "Leave blank to keep existing token"
													: "Twilio auth token (encrypted at rest)"}
											</FieldDescription>
										</Field>
									)}
								</form.Field>
								<form.Field name="twilioPhoneNumber">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="phone">Phone number</FieldLabel>
											<Input
												id="phone"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="+15551234567"
												maxLength={20}
												autoComplete="off"
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldDescription>
												E.164 format, e.g. +15551234567 (used when Messaging
												Service SID is empty)
											</FieldDescription>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="twilioMessagingServiceSid">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="msgSid">
												Messaging Service SID
											</FieldLabel>
											<Input
												id="msgSid"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="MG..."
												maxLength={100}
												autoComplete="off"
											/>
											<FieldDescription>
												Optional — preferred over From phone when set (starts
												with MG…)
											</FieldDescription>
										</Field>
									)}
								</form.Field>
							</FieldGroup>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Staffing digest</CardTitle>
							<CardDescription>
								Daily email/SMS when departures need guides or fleet (07:00
								UTC). Also link from Home → Needs staffing.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<FieldGroup className="gap-4">
								<form.Field name="staffingDigestEnabled">
									{(field) => (
										<Field orientation="horizontal">
											<FieldLabel htmlFor="digest-enabled">
												Enable daily staffing digest
											</FieldLabel>
											<Switch
												id="digest-enabled"
												checked={field.state.value}
												onCheckedChange={field.handleChange}
											/>
										</Field>
									)}
								</form.Field>
								<FieldGroup className="grid gap-4 md:grid-cols-2">
									<form.Field name="staffingDigestEmail">
										{(field) => (
											<Field data-invalid={!field.state.meta.isValid}>
												<FieldLabel htmlFor="digestEmail">
													Digest email
												</FieldLabel>
												<Input
													id="digestEmail"
													type="email"
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
													placeholder="ops@tours.co"
													aria-invalid={!field.state.meta.isValid}
												/>
												<FieldError
													errors={metaErrors(field.state.meta.errors)}
												/>
											</Field>
										)}
									</form.Field>
									<form.Field name="staffingDigestPhone">
										{(field) => (
											<Field data-invalid={!field.state.meta.isValid}>
												<FieldLabel htmlFor="digestPhone">
													Digest phone
												</FieldLabel>
												<Input
													id="digestPhone"
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
													placeholder="+15551234567"
													aria-invalid={!field.state.meta.isValid}
												/>
												<FieldDescription>
													E.164 — requires Twilio enabled
												</FieldDescription>
												<FieldError
													errors={metaErrors(field.state.meta.errors)}
												/>
											</Field>
										)}
									</form.Field>
								</FieldGroup>
								<form.Field name="staffingDigestDaysAhead">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="digestDays">Days ahead</FieldLabel>
											<Input
												id="digestDays"
												type="number"
												min="1"
												max="14"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												className="w-24"
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldDescription>
												Include gaps from today through this many days (1–14)
											</FieldDescription>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
								<form.Subscribe selector={(state) => state.isSubmitting}>
									{(isSubmitting) => (
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={digestPending || isSubmitting}
											onClick={() => void onSendDigest()}
										>
											{digestPending ? (
												<Spinner data-icon="inline-start" />
											) : null}
											{digestPending ? "Sending…" : "Send digest now"}
										</Button>
									)}
								</form.Subscribe>
								<form.Field name="phoneRemindWithDigest">
									{(field) => (
										<Field orientation="horizontal">
											<Switch
												id="phone-remind-digest"
												checked={field.state.value}
												onCheckedChange={field.handleChange}
												className="mt-0.5"
											/>
											<FieldLabel htmlFor="phone-remind-digest">
												Also email assigned staff who are missing a phone
												<FieldDescription>
													Runs with the daily digest. Each person at most once
													per 7 days. Ops digest still lists them either way.
												</FieldDescription>
											</FieldLabel>
										</Field>
									)}
								</form.Field>
							</FieldGroup>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Guide availability reminders</CardTitle>
							<CardDescription>
								Daily email (08:00 UTC) to guides with unmarked days. Deep-links
								to their availability calendar. SMS if the guide has a phone on
								their profile and Twilio is enabled.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<FieldGroup className="gap-4">
								<form.Field name="availabilityReminderEnabled">
									{(field) => (
										<Field orientation="horizontal">
											<FieldLabel htmlFor="avail-enabled">
												Enable guide availability reminders
											</FieldLabel>
											<Switch
												id="avail-enabled"
												checked={field.state.value}
												onCheckedChange={field.handleChange}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="availabilityReminderDaysAhead">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="availDays">Days ahead</FieldLabel>
											<Input
												id="availDays"
												type="number"
												min="1"
												max="14"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												className="w-24"
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldDescription>
												Ask guides to confirm this many upcoming days (1–14)
											</FieldDescription>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
								<form.Subscribe
									selector={(state) =>
										[
											state.isSubmitting,
											state.values.availabilityReminderEnabled,
										] as const
									}
								>
									{([isSubmitting, availEnabled]) => (
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={availPending || isSubmitting || !availEnabled}
											onClick={() => void onSendAvail()}
										>
											{availPending ? (
												<Spinner data-icon="inline-start" />
											) : null}
											{availPending ? "Sending…" : "Send reminders now"}
										</Button>
									)}
								</form.Subscribe>
							</FieldGroup>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Assignment notifications</CardTitle>
							<CardDescription>
								Email guides and drivers when assigned, cancelled, or
								reassigned. SMS uses the phone on their profile when Twilio is
								enabled. On by default — uncheck to opt out. Test sends go to
								your own account (works even if the toggle is off).
							</CardDescription>
						</CardHeader>
						<CardContent>
							<FieldGroup className="gap-4">
								<form.Field name="assignmentNotifyEnabled">
									{(field) => (
										<Field orientation="horizontal">
											<FieldLabel htmlFor="assign-notify-enabled">
												Notify guides and drivers on assignment changes
											</FieldLabel>
											<Switch
												id="assign-notify-enabled"
												checked={field.state.value}
												onCheckedChange={field.handleChange}
											/>
										</Field>
									)}
								</form.Field>
								<form.Subscribe selector={(state) => state.isSubmitting}>
									{(isSubmitting) => (
										<div className="flex flex-wrap gap-2">
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={assignGuidePending || isSubmitting}
												onClick={() => void onSendAssignTest("guide")}
											>
												{assignGuidePending ? (
													<Spinner data-icon="inline-start" />
												) : null}
												{assignGuidePending ? "Sending…" : "Send test (guide)"}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={assignDriverPending || isSubmitting}
												onClick={() => void onSendAssignTest("driver")}
											>
												{assignDriverPending ? (
													<Spinner data-icon="inline-start" />
												) : null}
												{assignDriverPending
													? "Sending…"
													: "Send test (driver)"}
											</Button>
										</div>
									)}
								</form.Subscribe>
								<p className="text-muted-foreground text-xs">
									Manual reminds: Home → Remind all / Staffing → Email reminders
									(24h org cooldown, 7d per person). Digest auto-remind is
									opt-in above under Staffing digest.
								</p>
							</FieldGroup>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Delivery</CardTitle>
							<CardDescription>
								Retry policy and consent requirements
							</CardDescription>
						</CardHeader>
						<CardContent>
							<FieldGroup className="grid gap-4 md:grid-cols-2">
								<form.Field name="maxRetries">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="retries">Max retries</FieldLabel>
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
								<form.Field name="retryDelayMinutes">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="delay">
												Retry delay (minutes)
											</FieldLabel>
											<Input
												id="delay"
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
						</CardContent>
					</Card>

					{submitErr ? <ErrorBanner message={submitErr} /> : null}

					<form.Subscribe
						selector={(state) => [state.canSubmit, state.isSubmitting] as const}
					>
						{([canSubmit, isSubmitting]) => (
							<div className="flex justify-end">
								<Button type="submit" disabled={!canSubmit || isSubmitting}>
									{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
									{isSubmitting ? "Saving…" : "Save settings"}
								</Button>
							</div>
						)}
					</form.Subscribe>
				</FieldGroup>
			</form>
		</div>
	);
}
