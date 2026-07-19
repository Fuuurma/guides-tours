/**
 * Shared notification template rendering for email + SMS.
 *
 * Placeholders: `{{customerName}}` or `{customerName}`.
 * Unknown keys are left untouched so operators can spot typos.
 */

export type NotificationVars = {
	customerName: string;
	tourName: string;
	date: string;
	startTime: string;
};

export type StoredTemplateFields = {
	templateType: string;
	emailSubject?: string;
	emailBodyText?: string;
	emailBodyHtml?: string;
	smsBody?: string;
};

export type RenderedNotification = {
	subject: string;
	bodyText: string;
	bodyHtml: string;
	smsBody: string;
};

const ALLOWED_VARS = [
	"customerName",
	"tourName",
	"date",
	"startTime",
] as const;

export function escapeHtml(s: string): string {
	const map: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;",
	};
	return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

/**
 * Substitute placeholders. When `html` is true, interpolated values
 * are HTML-escaped so operator-authored HTML templates stay safe.
 */
export function renderTemplateString(
	template: string,
	vars: Record<string, string>,
	opts?: { html?: boolean },
): string {
	return template.replace(/\{\{?\s*(\w+)\s*\}?\}/g, (match, key: string) => {
		if (!(ALLOWED_VARS as readonly string[]).includes(key)) return match;
		const val = vars[key];
		if (val === undefined) return match;
		return opts?.html ? escapeHtml(val) : val;
	});
}

export function fallbackPlainText(
	templateType: string,
	vars: NotificationVars,
): string {
	switch (templateType) {
		case "booking_confirmation":
			return `Hi ${vars.customerName}, your booking for ${vars.tourName} on ${vars.date} at ${vars.startTime} is confirmed. We look forward to seeing you!`;
		case "reminder_24h":
			return `Hi ${vars.customerName}, this is a friendly reminder of your ${vars.tourName} tour on ${vars.date} at ${vars.startTime}.`;
		case "reminder_2h":
			return `Hi ${vars.customerName}, your ${vars.tourName} tour starts in 2 hours (${vars.date} ${vars.startTime}). See you soon!`;
		case "post_tour_review":
			return `Hi ${vars.customerName}, thanks for joining our ${vars.tourName} tour on ${vars.date}. We'd love a quick review.`;
		default:
			return `Hi ${vars.customerName}, you have an update about your tour on ${vars.date}.`;
	}
}

export function fallbackSubject(templateType: string): string {
	switch (templateType) {
		case "booking_confirmation":
			return "Booking confirmed";
		case "reminder_24h":
			return "Your tour is tomorrow";
		case "reminder_2h":
			return "Your tour starts in 2 hours";
		case "post_tour_review":
			return "How was your tour?";
		default:
			return "Tour update";
	}
}

/**
 * Prefer stored template fields when non-empty; otherwise fall back to
 * the built-in copy for the template type. SMS and email share one
 * variable map so operators only learn one placeholder dialect.
 */
export function renderNotification(
	template: StoredTemplateFields,
	vars: NotificationVars,
): RenderedNotification {
	const varMap: Record<string, string> = { ...vars };
	const plainFallback = fallbackPlainText(template.templateType, vars);

	const subject = template.emailSubject?.trim()
		? renderTemplateString(template.emailSubject, varMap)
		: fallbackSubject(template.templateType);

	const bodyText = template.emailBodyText?.trim()
		? renderTemplateString(template.emailBodyText, varMap)
		: plainFallback;

	const bodyHtml = template.emailBodyHtml?.trim()
		? renderTemplateString(template.emailBodyHtml, varMap, { html: true })
		: `<p>${escapeHtml(bodyText)}</p>`;

	const smsBody = template.smsBody?.trim()
		? renderTemplateString(template.smsBody, varMap)
		: plainFallback;

	return { subject, bodyText, bodyHtml, smsBody };
}
