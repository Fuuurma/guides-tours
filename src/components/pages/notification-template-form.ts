import { useForm } from "@tanstack/react-form";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { getSafeDisplayMessage } from "@/lib/utils";
import { validateEmail, validateName } from "@/lib/validation";
import type { api } from "../../../convex/_generated/api";

export type TemplateRow = NonNullable<
	FunctionReturnType<typeof api.notificationTemplates.get>
>;
export type PreviewRow = FunctionReturnType<
	typeof api.notificationTemplates.preview
>;

/**
 * The two notification-template forms (edit content, send test): shape,
 * defaults and submit paths, outside the route so the section components
 * type their `form` prop as the factory return types without a circular
 * import. Handlers close over their form legally — they run post-assignment.
 */
export function useTemplateEditForm(opts: {
	template: TemplateRow;
	updateTemplate: (args: {
		templateId: TemplateRow["_id"];
		name: string;
		emailSubject: string;
		emailBodyText: string;
		emailBodyHtml?: string;
		smsBody?: string;
		isActive: boolean;
	}) => Promise<unknown>;
	/** Runs after a successful save: clear editing state and refetch. */
	onSaved: () => void;
	onSaveError: (message: string) => void;
}) {
	const { template, updateTemplate, onSaved, onSaveError } = opts;
	const form = useForm({
		defaultValues: {
			name: template.name,
			isActive: template.isActive,
			emailSubject: template.emailSubject,
			emailBodyText: template.emailBodyText,
			emailBodyHtml: template.emailBodyHtml ?? "",
			smsBody: template.smsBody ?? "",
		},
		onSubmit: async ({ value }) => {
			const nameErr = validateName(value.name);
			if (nameErr) {
				form.setFieldMeta("name", (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: nameErr },
				}));
				return;
			}
			try {
				await updateTemplate({
					templateId: template._id,
					name: value.name.trim(),
					emailSubject: value.emailSubject.trim(),
					emailBodyText: value.emailBodyText,
					emailBodyHtml: value.emailBodyHtml.trim() || undefined,
					smsBody: value.smsBody.trim() || undefined,
					isActive: value.isActive,
				});
				toast.success("Template saved");
				onSaved();
			} catch (err) {
				onSaveError(getSafeDisplayMessage(err));
			}
		},
	});
	return form;
}

export type TemplateEditFormApi = ReturnType<typeof useTemplateEditForm>;

export function useTemplateTestForm(opts: {
	template: TemplateRow;
	sendTest: (args: {
		templateId: TemplateRow["_id"];
		channel: "email" | "sms";
		to: string;
	}) => Promise<unknown>;
	onTestError: (message: string) => void;
}) {
	const { template, sendTest, onTestError } = opts;
	const form = useForm({
		defaultValues: {
			channel: "email" as "email" | "sms",
			to: "",
		},
		onSubmit: async ({ value }) => {
			const to = value.to.trim();
			if (!to) {
				form.setFieldMeta("to", (prev) => ({
					...prev,
					errorMap: {
						...prev.errorMap,
						onSubmit:
							value.channel === "email"
								? "Enter an email address"
								: "Enter a phone number",
					},
				}));
				return;
			}
			if (value.channel === "email") {
				const emailErr = validateEmail(to);
				if (emailErr) {
					form.setFieldMeta("to", (prev) => ({
						...prev,
						errorMap: { ...prev.errorMap, onSubmit: emailErr },
					}));
					return;
				}
			}
			try {
				await sendTest({
					templateId: template._id,
					channel: value.channel,
					to,
				});
				toast.success("Test send queued — check Recent deliveries shortly");
			} catch (err) {
				onTestError(getSafeDisplayMessage(err));
			}
		},
	});
	return form;
}

export type TemplateTestFormApi = ReturnType<typeof useTemplateTestForm>;
