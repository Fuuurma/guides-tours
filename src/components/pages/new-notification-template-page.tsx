import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "../../../convex/_generated/api";
import { FormActions, FormField } from "../form";

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

export function NewNotificationTemplatePage() {
	const navigate = useNavigate();
	const create = useMutation(api.notificationTemplates.create);
	const [name, setName] = useState("");
	const [templateType, setTemplateType] = useState<string>("booking_confirmation");
	const [channel, setChannel] = useState<string>("email");
	const [emailSubject, setEmailSubject] = useState("");
	const [emailBodyText, setEmailBodyText] = useState("");
	const [smsBody, setSmsBody] = useState("");
	const [sendTiming, setSendTiming] = useState<string>("immediate");
	const [retryCount, setRetryCount] = useState("3");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);

		const retries = Number(retryCount);
		if (retries < 0) {
			setError("Retries cannot be negative");
			setPending(false);
			return;
		}

		try {
			const id = await create({
				name,
				templateType,
				channel,
				emailSubject,
				emailBodyText,
				smsBody: smsBody || undefined,
				sendTiming,
				retryCount: retries,
			});
			toast.success("Notification template created");
			void navigate({
				to: "/dashboard/notifications/$templateId",
				params: { templateId: id },
			});
		} catch (err) {
			setError((err as Error).message);
			toast.error((err as Error).message);
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="mx-auto max-w-2xl">
			<Card>
				<CardHeader>
					<CardTitle>New notification template</CardTitle>
					<CardDescription>
						Template for booking-related messages
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="space-y-4">
						<FormField label="Name *" htmlFor="name">
							<Input
								id="name"
								required
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Booking confirmation"
							/>
						</FormField>

						<div className="grid gap-4 md:grid-cols-2">
							<FormField label="Template type" htmlFor="type">
								<select
									id="type"
									value={templateType}
									onChange={(e) => setTemplateType(e.target.value)}
									className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
								>
									{TEMPLATE_TYPES.map((t) => (
										<option key={t} value={t}>
											{t}
										</option>
									))}
								</select>
							</FormField>

							<FormField label="Channel" htmlFor="channel">
								<select
									id="channel"
									value={channel}
									onChange={(e) => setChannel(e.target.value)}
									className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
								>
									{CHANNELS.map((c) => (
										<option key={c} value={c}>
											{c}
										</option>
									))}
								</select>
							</FormField>
						</div>

						<FormField label="Email subject *" htmlFor="subject">
							<Input
								id="subject"
								required
								value={emailSubject}
								onChange={(e) => setEmailSubject(e.target.value)}
								placeholder="Your booking is confirmed"
							/>
						</FormField>

						<FormField
							label="Email body (text) *"
							hint="Plain text — supports variables like {customerName}, {tourName}, {date}"
							htmlFor="body"
						>
							<textarea
								id="body"
								required
								value={emailBodyText}
								onChange={(e) => setEmailBodyText(e.target.value)}
								rows={6}
								className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[120px] w-full rounded-md border px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
							/>
						</FormField>

						{(channel === "sms" || channel === "both") && (
							<FormField
								label="SMS body"
								hint="Plain text — keep under 160 chars"
								htmlFor="sms"
							>
								<textarea
									id="sms"
									value={smsBody}
									onChange={(e) => setSmsBody(e.target.value)}
									rows={3}
									className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
								/>
							</FormField>
						)}

						<div className="grid gap-4 md:grid-cols-2">
							<FormField label="Send timing" htmlFor="timing">
								<select
									id="timing"
									value={sendTiming}
									onChange={(e) => setSendTiming(e.target.value)}
									className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
								>
									{SEND_TIMINGS.map((s) => (
										<option key={s} value={s}>
											{s}
										</option>
									))}
								</select>
							</FormField>

							<FormField label="Retries" htmlFor="retries">
								<Input
									id="retries"
									type="number"
									min="0"
									value={retryCount}
									onChange={(e) => setRetryCount(e.target.value)}
								/>
							</FormField>
						</div>

						{error && <p className="text-destructive text-sm">{error}</p>}

						<FormActions
							onCancel={() => navigate({ to: "/dashboard/notifications" })}
							pending={pending}
							submitLabel="Create template"
						/>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
