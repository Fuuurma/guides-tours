import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { FormField } from "../form";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";

const TEMPLATE_TYPES = [
	"booking_confirmation", "reminder_24h", "reminder_2h", "reminder_1h",
	"post_tour_review", "booking_cancelled", "booking_modified",
	"payment_received", "payment_failed", "custom",
] as const;
const CHANNELS = ["email", "sms", "both"] as const;
const SEND_TIMINGS = ["immediate", "24h_before", "2h_before", "1h_before", "post_tour", "custom"] as const;

interface FormValues extends Record<string, unknown> {
	name: string;
	templateType: string;
	channel: string;
	emailSubject: string;
	emailBodyText: string;
	smsBody: string;
	sendTiming: string;
	retryCount: string;
}

const INITIAL: FormValues = {
	name: "",
	templateType: "booking_confirmation",
	channel: "email",
	emailSubject: "",
	emailBodyText: "",
	smsBody: "",
	sendTiming: "immediate",
	retryCount: "3",
};

export function NewNotificationTemplatePage() {
	const create = useMutation(api.notificationTemplates.create);
	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const retries = Number(v.retryCount);
			if (retries < 0) throw new Error("Retries cannot be negative");
			const id = await create({
				name: v.name,
				templateType: v.templateType,
				channel: v.channel,
				emailSubject: v.emailSubject,
				emailBodyText: v.emailBodyText,
				smsBody: v.smsBody || undefined,
				sendTiming: v.sendTiming,
				retryCount: retries,
			});
			return id;
		},
		initialValues: INITIAL,
		redirectTo: (id) => `/dashboard/notifications/${id}`,
		successMessage: "Notification template created",
	});

	const channel = form.values.channel;

	return (
		<EntityFormPage
			form={form}
			title="New notification template"
			description="Template for booking-related messages"
			backTo="/dashboard/notifications"
			submitLabel="Create template"
		>
			<FormField label="Name *" htmlFor="name">
				<Input id="name" required value={form.values.name} onChange={(e) => form.set("name", e.target.value)} placeholder="Booking confirmation" />
			</FormField>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Template type" htmlFor="type">
					<Select value={form.values.templateType} onValueChange={(v) => form.set("templateType", v)}>
						<SelectTrigger id="type"><SelectValue /></SelectTrigger>
						<SelectContent>
							{TEMPLATE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
						</SelectContent>
					</Select>
				</FormField>
				<FormField label="Channel" htmlFor="channel">
					<Select value={channel} onValueChange={(v) => form.set("channel", v)}>
						<SelectTrigger id="channel"><SelectValue /></SelectTrigger>
						<SelectContent>
							{CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
						</SelectContent>
					</Select>
				</FormField>
			</div>

			<FormField label="Email subject *" htmlFor="subject">
				<Input id="subject" required value={form.values.emailSubject} onChange={(e) => form.set("emailSubject", e.target.value)} placeholder="Your booking is confirmed" />
			</FormField>

			<FormField label="Email body (text) *" hint="Plain text — supports variables like {customerName}, {tourName}, {date}" htmlFor="body">
				<Textarea id="body" required value={form.values.emailBodyText} onChange={(e) => form.set("emailBodyText", e.target.value)} rows={6} className="font-mono" />
			</FormField>

			{(channel === "sms" || channel === "both") && (
				<FormField label="SMS body" hint="Plain text — keep under 160 chars" htmlFor="sms">
					<Textarea id="sms" value={form.values.smsBody} onChange={(e) => form.set("smsBody", e.target.value)} rows={3} />
				</FormField>
			)}

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Send timing" htmlFor="timing">
					<Select value={form.values.sendTiming} onValueChange={(v) => form.set("sendTiming", v)}>
						<SelectTrigger id="timing"><SelectValue /></SelectTrigger>
						<SelectContent>
							{SEND_TIMINGS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
						</SelectContent>
					</Select>
				</FormField>
				<FormField label="Retries" htmlFor="retries">
					<Input id="retries" type="number" min="0" value={form.values.retryCount} onChange={(e) => form.set("retryCount", e.target.value)} />
				</FormField>
			</div>
		</EntityFormPage>
	);
}
