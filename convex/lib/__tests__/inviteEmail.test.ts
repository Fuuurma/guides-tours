import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendTemplatedEmail = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());
const loggerWarn = vi.hoisted(() => vi.fn());
const loggerInfo = vi.hoisted(() => vi.fn());

vi.mock("../sendEmail", () => ({ sendTemplatedEmail }));
vi.mock("../logger", () => ({
	logger: { error: loggerError, warn: loggerWarn, info: loggerInfo },
}));

import { sendInvitationEmail } from "../inviteEmail";

const DATA = {
	id: "inv_123",
	email: "Guide@Example.com",
	organization: { name: "Acme <Tours>" },
};

describe("sendInvitationEmail", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("SITE_URL", "https://app.example.com");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("throws when SITE_URL is unset — the invite link would be broken", async () => {
		vi.stubEnv("SITE_URL", "");
		await expect(sendInvitationEmail(DATA)).rejects.toThrow(/SITE_URL/);
		expect(sendTemplatedEmail).not.toHaveBeenCalled();
	});

	it("resolves without throwing when SES delivery fails", async () => {
		sendTemplatedEmail.mockResolvedValueOnce({
			status: "failed",
			error: "SES 400: MessageRejected",
		});
		await expect(sendInvitationEmail(DATA)).resolves.toBeUndefined();
		expect(loggerError).toHaveBeenCalledWith(
			expect.stringMatching(/SES send failed for Guide@Example\.com/),
		);
	});

	it("resolves without throwing when SES is not configured (skipped)", async () => {
		sendTemplatedEmail.mockResolvedValueOnce({
			status: "skipped",
			reason: "SES not configured: AWS_REGION",
		});
		await expect(sendInvitationEmail(DATA)).resolves.toBeUndefined();
		expect(loggerError).not.toHaveBeenCalled();
	});

	it("sends the invite link and HTML-escapes user fields on success", async () => {
		sendTemplatedEmail.mockResolvedValueOnce({ status: "sent" });
		await sendInvitationEmail(DATA);
		expect(sendTemplatedEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "Guide@Example.com",
				subject: expect.stringContaining("Acme <Tours>"),
				bodyText: expect.stringContaining(
					"https://app.example.com/invite/inv_123",
				),
				bodyHtml: expect.stringContaining("Acme &lt;Tours&gt;"),
			}),
		);
		expect(loggerError).not.toHaveBeenCalled();
	});
});
