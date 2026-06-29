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
import { Input } from "@/components/ui/input";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { api } from "../../../convex/_generated/api";
import { getErrorMessage } from "@/lib/utils";
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
	whatsappEnabled: boolean;
	emailEnabled: boolean;
	emailFromName: string;
	emailFromEmail: string;
	useCompanyDefaults: boolean;
	requireSmsConsent: boolean;
	requireEmailConsent: boolean;
	maxRetries: number;
	retryDelayMinutes: number;
}

export function NotificationSettingsPage() {
	const { data: settings, isPending } = useQuery(
		convexQuery(api.notificationSettings.get, {}),
	);
	const upsert = useMutation(api.notificationSettings.upsert);

	const [twilioEnabled, setTwilioEnabled] = useState(false);
	const [twilioAccountSid, setTwilioAccountSid] = useState("");
	const [twilioAuthToken, setTwilioAuthToken] = useState("");
	const [twilioPhoneNumber, setTwilioPhoneNumber] = useState("");
	const [whatsappEnabled, setWhatsappEnabled] = useState(false);
	const [emailEnabled, setEmailEnabled] = useState(true);
	const [emailFromName, setEmailFromName] = useState("");
	const [emailFromEmail, setEmailFromEmail] = useState("");
	const [maxRetries, setMaxRetries] = useState("3");
	const [retryDelayMinutes, setRetryDelayMinutes] = useState("15");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (settings) {
			const s = settings as Settings;
			setTwilioEnabled(s.twilioEnabled);
			setTwilioAccountSid(s.twilioAccountSid);
			setTwilioPhoneNumber(s.twilioPhoneNumber);
			setWhatsappEnabled(s.whatsappEnabled);
			setEmailEnabled(s.emailEnabled);
			setEmailFromName(s.emailFromName);
			setEmailFromEmail(s.emailFromEmail);
			setMaxRetries(s.maxRetries.toString());
			setRetryDelayMinutes(s.retryDelayMinutes.toString());
		}
	}, [settings]);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);

		const retries = Number(maxRetries);
		const delay = Number(retryDelayMinutes);
		if (retries < 0 || delay < 0) {
			setError("Retries and delay must be non-negative");
			setPending(false);
			return;
		}

		try {
			await upsert({
				twilioEnabled,
				twilioAccountSid: twilioAccountSid || undefined,
				twilioAuthToken: twilioAuthToken || undefined,
				twilioPhoneNumber: twilioPhoneNumber || undefined,
				whatsappEnabled,
				emailEnabled,
				emailFromName: emailFromName || undefined,
				emailFromEmail: emailFromEmail || undefined,
				maxRetries: retries,
				retryDelayMinutes: delay,
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
							hint="E.164 format, e.g. +15551234567"
							htmlFor="phone"
						>
							<Input
								id="phone"
								value={twilioPhoneNumber}
								onChange={(e) => setTwilioPhoneNumber(e.target.value)}
								placeholder="+15551234567"
							/>
						</FormField>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>WhatsApp</CardTitle>
						<CardDescription>WhatsApp Business API (optional)</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<label
							htmlFor="whatsapp-enabled"
							className="flex items-center gap-2 text-sm"
						>
							<Checkbox
								id="whatsapp-enabled"
								checked={whatsappEnabled}
								onCheckedChange={(checked) =>
									setWhatsappEnabled(checked === true)
								}
							/>
							WhatsApp channel enabled
						</label>
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

				{error && <p className="text-destructive text-sm">{error}</p>}

				<FormActions pending={pending} submitLabel="Save settings" />
			</form>
		</div>
	);
}
