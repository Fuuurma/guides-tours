import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { getSafeDisplayMessage } from "@/lib/utils";
import {
	MAX_NAME_LEN,
	validateEmail,
	validateNonNegativeNumber,
	validatePhoneOptional,
	validatePositiveInteger,
} from "@/lib/validation";

export type NotifFormValues = {
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

export interface Settings {
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

export type NotifUpsertArgs = {
	twilioEnabled: boolean;
	twilioAccountSid?: string;
	twilioAuthToken?: string;
	twilioPhoneNumber?: string;
	twilioMessagingServiceSid: string;
	emailEnabled: boolean;
	emailFromName?: string;
	emailFromEmail?: string;
	maxRetries: number;
	retryDelayMinutes: number;
	staffingDigestEnabled: boolean;
	staffingDigestEmail: string;
	staffingDigestPhone: string;
	staffingDigestDaysAhead: number;
	availabilityReminderEnabled: boolean;
	availabilityReminderDaysAhead: number;
	assignmentNotifyEnabled: boolean;
	phoneRemindWithDigest: boolean;
};

function daysAheadError(value: string, label: string): string | null {
	const err = validatePositiveInteger(value, label);
	if (err) return err;
	const n = Number(value);
	if (n < 1 || n > 14) return `${label} must be between 1 and 14`;
	return null;
}

/**
 * The notification-settings form: shape, defaults, and the submit path with
 * its field-level validation, outside the page so the card components type
 * their `form` prop as `ReturnType<typeof useNotifForm>` without a circular
 * import and the page stays a data + composition component. The auth token
 * is write-only: seeded empty, cleared after every save. The submit handler
 * closes over `form` legally - it only runs after assignment.
 */
export function useNotifForm(opts: {
	upsert: (args: NotifUpsertArgs) => Promise<unknown>;
	onSubmitError: (message: string) => void;
	settings: Settings | null;
}) {
	const { upsert, onSubmitError, settings } = opts;
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
				const message = getSafeDisplayMessage(err);
				onSubmitError(message);
				toast.error(message);
			}
		},
	});
	return form;
}

export type NotifFormApi = ReturnType<typeof useNotifForm>;

export function metaErrors(
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
