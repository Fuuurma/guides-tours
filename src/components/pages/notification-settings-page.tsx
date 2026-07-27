import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import { FormActions, FormField } from "../form";

export const Route = createFileRoute("/dashboard/notifications/settings")({
	component: NotificationSettingsPage,
});

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

export function NotificationSettingsPage() {
	const { data: settings, isPending } = useQuery(
		convexQuery(api.notificationSettings.get, {}),
	);
	const upsert = useMutation(api.notificationSettings.upsert);
	const sendDigestNow = useMutation(api.staffingDigest.sendNow);
	const sendAvailNow = useMutation(api.availabilityReminders.sendNow);
	const sendAssignTest = useMutation(api.assignmentNotifications.sendTest);

	const [twilioEnabled, setTwilioEnabled] = useState(false);
	const [twilioAccountSid, setTwilioAccountSid] = useState("");
	const [twilioAuthToken, setTwilioAuthToken] = useState("");
	const [twilioPhoneNumber, setTwilioPhoneNumber] = useState("");
	const [twilioMessagingServiceSid, setTwilioMessagingServiceSid] =
		useState("");
	const [emailEnabled, setEmailEnabled] = useState(true);
	const [emailFromName, setEmailFromName] = useState("");
	const [emailFromEmail, setEmailFromEmail] = useState("");
	const [maxRetries, setMaxRetries] = useState("3");
	const [retryDelayMinutes, setRetryDelayMinutes] = useState("15");
	const [staffingDigestEnabled, setStaffingDigestEnabled] = useState(false);
	const [staffingDigestEmail, setStaffingDigestEmail] = useState("");
	const [staffingDigestPhone, setStaffingDigestPhone] = useState("");
	const [staffingDigestDaysAhead, setStaffingDigestDaysAhead] = useState("3");
	const [availabilityReminderEnabled, setAvailabilityReminderEnabled] =
		useState(false);
	const [availabilityReminderDaysAhead, setAvailabilityReminderDaysAhead] =
		useState("7");
	const [assignmentNotifyEnabled, setAssignmentNotifyEnabled] = useState(true);
	const [phoneRemindWithDigest, setPhoneRemindWithDigest] = useState(false);
	const [pending, setPending] = useState(false);
	const [digestPending, setDigestPending] = useState(false);
	const [availPending, setAvailPending] = useState(false);
	const [assignTestPending, setAssignTestPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (settings) {
			const s = settings as Settings;
			setTwilioEnabled(s.twilioEnabled);
			setTwilioAccountSid(s.twilioAccountSid);
			setTwilioPhoneNumber(s.twilioPhoneNumber);
			setTwilioMessagingServiceSid(s.twilioMessagingServiceSid ?? "");
			setEmailEnabled(s.emailEnabled);
			setEmailFromName(s.emailFromName);
			setEmailFromEmail(s.emailFromEmail);
			setMaxRetries(s.maxRetries.toString());
			setRetryDelayMinutes(s.retryDelayMinutes.toString());
			setStaffingDigestEnabled(s.staffingDigestEnabled === true);
			setStaffingDigestEmail(s.staffingDigestEmail ?? "");
			setStaffingDigestPhone(s.staffingDigestPhone ?? "");
			setStaffingDigestDaysAhead(String(s.staffingDigestDaysAhead ?? 3));
			setAvailabilityReminderEnabled(s.availabilityReminderEnabled === true);
			setAvailabilityReminderDaysAhead(
				String(s.availabilityReminderDaysAhead ?? 7),
			);
			setAssignmentNotifyEnabled(s.assignmentNotifyEnabled !== false);
			setPhoneRemindWithDigest(s.phoneRemindWithDigest === true);
		}
	}, [settings]);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);

		const retries = Number(maxRetries);
		const delay = Number(retryDelayMinutes);
		const daysAhead = Number(staffingDigestDaysAhead);
		const availDays = Number(availabilityReminderDaysAhead);
		if (retries < 0 || delay < 0) {
			setError("Retries and delay must be non-negative");
			setPending(false);
			return;
		}
		if (daysAhead < 1 || daysAhead > 14) {
			setError("Digest days ahead must be between 1 and 14");
			setPending(false);
			return;
		}
		if (availDays < 1 || availDays > 14) {
			setError("Availability reminder days ahead must be between 1 and 14");
			setPending(false);
			return;
		}

		try {
			await upsert({
				twilioEnabled,
				twilioAccountSid: twilioAccountSid || undefined,
				twilioAuthToken: twilioAuthToken || undefined,
				twilioPhoneNumber: twilioPhoneNumber || undefined,
				// Empty string clears a previously saved SID (backend
				// normalizes "" → undefined on the stored field).
				twilioMessagingServiceSid: twilioMessagingServiceSid,
				emailEnabled,
				emailFromName: emailFromName || undefined,
				emailFromEmail: emailFromEmail || undefined,
				maxRetries: retries,
				retryDelayMinutes: delay,
				staffingDigestEnabled,
				staffingDigestEmail: staffingDigestEmail,
				staffingDigestPhone: staffingDigestPhone,
				staffingDigestDaysAhead: daysAhead,
				availabilityReminderEnabled,
				availabilityReminderDaysAhead: availDays,
				assignmentNotifyEnabled,
				phoneRemindWithDigest,
			});
			setTwilioAuthToken("");
			toast.success("Settings saved");
		} catch (err) {
			setError(getErrorMessage(err));
			toast.error(getErrorMessage(err));
		} finally {
			setPending(false);
		}
	};

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
		setAssignTestPending(true);
		try {
			await sendAssignTest({ role });
			toast.success(`Test ${role} notification queued — check your email/SMS`);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setAssignTestPending(false);
		}
	};

	if (isPending) {
		return <DetailSkeleton />;
	}

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<header className="flex items-center justify-between">
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

			<form onSubmit={onSubmit} className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Email (SES)</CardTitle>
						<CardDescription>
							Outbound transactional email via AWS SES
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<label
							htmlFor="email-enabled"
							className="flex items-center gap-2 text-sm"
						>
							<Checkbox
								id="email-enabled"
								checked={emailEnabled}
								onCheckedChange={(checked) => setEmailEnabled(checked === true)}
							/>
							Email channel enabled
						</label>
						<div className="grid gap-4 md:grid-cols-2">
							<FormField label="From name" htmlFor="fromName">
								<Input
									id="fromName"
									value={emailFromName}
									onChange={(e) => setEmailFromName(e.target.value)}
									placeholder="Tours Co."
								/>
							</FormField>
							<FormField label="From email" htmlFor="fromEmail">
								<Input
									id="fromEmail"
									type="email"
									value={emailFromEmail}
									onChange={(e) => setEmailFromEmail(e.target.value)}
									placeholder="bookings@tours.co"
								/>
							</FormField>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>SMS (Twilio)</CardTitle>
						<CardDescription>Outbound SMS via Twilio</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<label
							htmlFor="twilio-enabled"
							className="flex items-center gap-2 text-sm"
						>
							<Checkbox
								id="twilio-enabled"
								checked={twilioEnabled}
								onCheckedChange={(checked) =>
									setTwilioEnabled(checked === true)
								}
							/>
							Twilio channel enabled
						</label>
						<FormField
							label="Account SID"
							hint="Twilio account SID (starts with AC...)"
							htmlFor="sid"
						>
							<Input
								id="sid"
								value={twilioAccountSid}
								onChange={(e) => setTwilioAccountSid(e.target.value)}
								placeholder="AC..."
							/>
						</FormField>
						<FormField
							label="Auth token"
							hint={
								settings
									? "Leave blank to keep existing token"
									: "Twilio auth token (encrypted at rest)"
							}
							htmlFor="token"
						>
							<div className="flex gap-2 items-center">
								<Input
									id="token"
									type="password"
									value={twilioAuthToken}
									onChange={(e) => setTwilioAuthToken(e.target.value)}
									placeholder={settings ? "•••••••" : "Enter token"}
								/>
								{settings && <Badge variant="secondary">Token set</Badge>}
							</div>
						</FormField>
						<FormField
							label="Phone number"
							hint="E.164 format, e.g. +15551234567 (used when Messaging Service SID is empty)"
							htmlFor="phone"
						>
							<Input
								id="phone"
								value={twilioPhoneNumber}
								onChange={(e) => setTwilioPhoneNumber(e.target.value)}
								placeholder="+15551234567"
							/>
						</FormField>
						<FormField
							label="Messaging Service SID"
							hint="Optional — preferred over From phone when set (starts with MG…)"
							htmlFor="msgSid"
						>
							<Input
								id="msgSid"
								value={twilioMessagingServiceSid}
								onChange={(e) => setTwilioMessagingServiceSid(e.target.value)}
								placeholder="MG..."
							/>
						</FormField>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Staffing digest</CardTitle>
						<CardDescription>
							Daily email/SMS when departures need guides or fleet (07:00 UTC).
							Also link from Home → Needs staffing.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<label
							htmlFor="digest-enabled"
							className="flex items-center gap-2 text-sm"
						>
							<Checkbox
								id="digest-enabled"
								checked={staffingDigestEnabled}
								onCheckedChange={(checked) =>
									setStaffingDigestEnabled(checked === true)
								}
							/>
							Enable daily staffing digest
						</label>
						<div className="grid gap-4 md:grid-cols-2">
							<FormField label="Digest email" htmlFor="digestEmail">
								<Input
									id="digestEmail"
									type="email"
									value={staffingDigestEmail}
									onChange={(e) => setStaffingDigestEmail(e.target.value)}
									placeholder="ops@tours.co"
								/>
							</FormField>
							<FormField
								label="Digest phone"
								hint="E.164 — requires Twilio enabled"
								htmlFor="digestPhone"
							>
								<Input
									id="digestPhone"
									value={staffingDigestPhone}
									onChange={(e) => setStaffingDigestPhone(e.target.value)}
									placeholder="+15551234567"
								/>
							</FormField>
						</div>
						<FormField
							label="Days ahead"
							hint="Include gaps from today through this many days (1–14)"
							htmlFor="digestDays"
						>
							<Input
								id="digestDays"
								type="number"
								min="1"
								max="14"
								value={staffingDigestDaysAhead}
								onChange={(e) => setStaffingDigestDaysAhead(e.target.value)}
								className="w-24"
							/>
						</FormField>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={digestPending || pending}
							onClick={() => void onSendDigest()}
						>
							{digestPending ? "Sending…" : "Send digest now"}
						</Button>
						<label
							htmlFor="phone-remind-digest"
							className="flex items-start gap-2 text-sm"
						>
							<Checkbox
								id="phone-remind-digest"
								checked={phoneRemindWithDigest}
								onCheckedChange={(checked) =>
									setPhoneRemindWithDigest(checked === true)
								}
								className="mt-0.5"
							/>
							<span>
								Also email assigned staff who are missing a phone
								<span className="text-muted-foreground block text-xs">
									Runs with the daily digest. Each person at most once per 7
									days. Ops digest still lists them either way.
								</span>
							</span>
						</label>
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
					<CardContent className="space-y-4">
						<label
							htmlFor="avail-enabled"
							className="flex items-center gap-2 text-sm"
						>
							<Checkbox
								id="avail-enabled"
								checked={availabilityReminderEnabled}
								onCheckedChange={(checked) =>
									setAvailabilityReminderEnabled(checked === true)
								}
							/>
							Enable guide availability reminders
						</label>
						<FormField
							label="Days ahead"
							hint="Ask guides to confirm this many upcoming days (1–14)"
							htmlFor="availDays"
						>
							<Input
								id="availDays"
								type="number"
								min="1"
								max="14"
								value={availabilityReminderDaysAhead}
								onChange={(e) =>
									setAvailabilityReminderDaysAhead(e.target.value)
								}
								className="w-24"
							/>
						</FormField>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={availPending || pending || !availabilityReminderEnabled}
							onClick={() => void onSendAvail()}
						>
							{availPending ? "Sending…" : "Send reminders now"}
						</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Assignment notifications</CardTitle>
						<CardDescription>
							Email guides and drivers when assigned, cancelled, or reassigned.
							SMS uses the phone on their profile when Twilio is enabled. On by
							default — uncheck to opt out. Test sends go to your own account
							(works even if the toggle is off).
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<label
							htmlFor="assign-notify-enabled"
							className="flex items-center gap-2 text-sm"
						>
							<Checkbox
								id="assign-notify-enabled"
								checked={assignmentNotifyEnabled}
								onCheckedChange={(checked) =>
									setAssignmentNotifyEnabled(checked === true)
								}
							/>
							Notify guides and drivers on assignment changes
						</label>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={assignTestPending || pending}
								onClick={() => void onSendAssignTest("guide")}
							>
								{assignTestPending ? "Sending…" : "Send test (guide)"}
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={assignTestPending || pending}
								onClick={() => void onSendAssignTest("driver")}
							>
								{assignTestPending ? "Sending…" : "Send test (driver)"}
							</Button>
						</div>
						<p className="text-muted-foreground text-xs">
							Manual reminds: Home → Remind all / Staffing → Email reminders
							(24h org cooldown, 7d per person). Digest auto-remind is opt-in
							above under Staffing digest.
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Delivery</CardTitle>
						<CardDescription>
							Retry policy and consent requirements
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid gap-4 md:grid-cols-2">
							<FormField label="Max retries" htmlFor="retries">
								<Input
									id="retries"
									type="number"
									min="0"
									value={maxRetries}
									onChange={(e) => setMaxRetries(e.target.value)}
								/>
							</FormField>
							<FormField label="Retry delay (minutes)" htmlFor="delay">
								<Input
									id="delay"
									type="number"
									min="0"
									value={retryDelayMinutes}
									onChange={(e) => setRetryDelayMinutes(e.target.value)}
								/>
							</FormField>
						</div>
					</CardContent>
				</Card>

				{error && <ErrorBanner message={error} />}

				<FormActions pending={pending} submitLabel="Save settings" />
			</form>
		</div>
	);
}
