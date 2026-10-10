import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AssignmentNotificationsCard,
	AvailabilityRemindersCard,
	DeliveryCard,
	EmailChannelCard,
	StaffingDigestCard,
	TwilioChannelCard,
} from "@/components/pages/notification-settings-fields";
import {
	type Settings,
	useNotifForm,
} from "@/components/pages/notification-settings-form";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { FieldGroup } from "@/components/ui/field";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { getSafeDisplayMessage } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

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
	const upsertMutation = useMutation(api.notificationSettings.upsert);
	const sendDigestNow = useMutation(api.staffingDigest.sendNow);
	const sendAvailNow = useMutation(api.availabilityReminders.sendNow);
	const sendAssignTest = useMutation(api.assignmentNotifications.sendTest);

	const [submitErr, setSubmitErr] = useState<string | null>(null);
	const [digestPending, setDigestPending] = useState(false);
	const [availPending, setAvailPending] = useState(false);
	const [assignGuidePending, setAssignGuidePending] = useState(false);
	const [assignDriverPending, setAssignDriverPending] = useState(false);

	const form = useNotifForm({
		upsert: (args) => upsertMutation(args),
		onSubmitError: setSubmitErr,
		settings,
	});

	const onSendDigest = async () => {
		setDigestPending(true);
		try {
			await sendDigestNow({ force: true });
			toast.success("Digest queued — check email/SMS shortly");
		} catch (err) {
			toast.error(getSafeDisplayMessage(err));
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
			toast.error(getSafeDisplayMessage(err));
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
			toast.error(getSafeDisplayMessage(err));
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<header className="flex items-center justify-between gap-4">
				<div>
					<h1 className="font-display text-2xl font-medium tracking-tight">
						Notification settings
					</h1>
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
					<EmailChannelCard form={form} />
					<TwilioChannelCard form={form} settings={settings} />
					<StaffingDigestCard
						form={form}
						digestPending={digestPending}
						onSendDigest={() => void onSendDigest()}
					/>
					<AvailabilityRemindersCard
						form={form}
						availPending={availPending}
						onSendAvail={() => void onSendAvail()}
					/>
					<AssignmentNotificationsCard
						form={form}
						assignGuidePending={assignGuidePending}
						assignDriverPending={assignDriverPending}
						onSendAssignTest={(role) => void onSendAssignTest(role)}
					/>
					<DeliveryCard form={form} />

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
