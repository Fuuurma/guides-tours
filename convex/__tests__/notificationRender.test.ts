import { describe, expect, it } from "vitest";
import {
	escapeHtml,
	fallbackPlainText,
	fallbackSubject,
	renderNotification,
	renderTemplateString,
} from "../lib/notificationRender";

describe("notificationRender", () => {
	const vars = {
		customerName: "Alice <Boss>",
		tourName: "Old Town",
		date: "2026-07-20",
		startTime: "09:00",
	};

	it("substitutes {{var}} and {var} placeholders", () => {
		expect(
			renderTemplateString("Hi {{customerName}} on {date}", vars),
		).toBe("Hi Alice <Boss> on 2026-07-20");
	});

	it("escapes interpolated values in HTML mode", () => {
		expect(
			renderTemplateString("<p>Hi {{customerName}}</p>", vars, { html: true }),
		).toBe("<p>Hi Alice &lt;Boss&gt;</p>");
	});

	it("leaves unknown placeholders untouched", () => {
		expect(renderTemplateString("Hi {{unknown}}", vars)).toBe("Hi {{unknown}}");
	});

	it("prefers stored email fields when non-empty", () => {
		const rendered = renderNotification(
			{
				templateType: "booking_confirmation",
				emailSubject: "Confirmed: {{tourName}}",
				emailBodyText: "Hello {{customerName}}",
				emailBodyHtml: "<strong>{{tourName}}</strong>",
				smsBody: "SMS {{date}} {{startTime}}",
			},
			vars,
		);
		expect(rendered.subject).toBe("Confirmed: Old Town");
		expect(rendered.bodyText).toBe("Hello Alice <Boss>");
		expect(rendered.bodyHtml).toBe("<strong>Old Town</strong>");
		expect(rendered.smsBody).toBe("SMS 2026-07-20 09:00");
	});

	it("falls back when stored fields are blank", () => {
		const rendered = renderNotification(
			{
				templateType: "booking_confirmation",
				emailSubject: "",
				emailBodyText: "  ",
				emailBodyHtml: "",
				smsBody: "",
			},
			vars,
		);
		expect(rendered.subject).toBe(fallbackSubject("booking_confirmation"));
		expect(rendered.bodyText).toBe(
			fallbackPlainText("booking_confirmation", vars),
		);
		expect(rendered.bodyHtml).toContain(escapeHtml(vars.customerName));
		expect(rendered.smsBody).toBe(rendered.bodyText);
	});
});
