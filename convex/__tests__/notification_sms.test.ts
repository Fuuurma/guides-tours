/**
 * Unit tests for Twilio SMS helper (mocked fetch + decrypt path).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/crypto", () => ({
	decrypt: vi.fn(async (enc: string) => {
		if (enc === "bad") throw new Error("decrypt fail");
		return "auth-token";
	}),
}));

import { sendTwilioSms } from "../notification_sms";

describe("sendTwilioSms", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("skips when Twilio is not configured", async () => {
		const ctx = {
			runQuery: vi.fn(async () => null),
			runMutation: vi.fn(),
		};
		const result = await sendTwilioSms(ctx as never, {
			organizationId: "org1",
			to: "+15551234567",
			body: "Hello",
			recipientName: "Ada",
		});
		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/not configured/i);
		expect(ctx.runMutation).not.toHaveBeenCalled();
	});

	it("sends via Messaging Service SID when set", async () => {
		const ctx = {
			runQuery: vi.fn(async () => ({
				accountSid: "ACxxx",
				authTokenEncrypted: "iv:ct:tag",
				messagingServiceSid: "MGxxx",
				phoneNumber: "+15550001111",
			})),
			runMutation: vi.fn(async () => "sms1"),
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ sid: "SMxxx", status: "queued" }),
			})),
		);

		const result = await sendTwilioSms(ctx as never, {
			organizationId: "org1",
			to: "+15551234567",
			body: "Hello",
			recipientName: "Ada",
		});

		expect(result.ok).toBe(true);
		expect(result.sid).toBe("SMxxx");
		const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
		const body = String(fetchMock.mock.calls[0]?.[1]?.body ?? "");
		expect(body).toContain("MessagingServiceSid=MGxxx");
		expect(body).not.toContain("From=");
		expect(ctx.runMutation).toHaveBeenCalled();
	});

	it("records failure when Twilio returns an error", async () => {
		const ctx = {
			runQuery: vi.fn(async () => ({
				accountSid: "ACxxx",
				authTokenEncrypted: "iv:ct:tag",
				phoneNumber: "+15550001111",
			})),
			runMutation: vi.fn(async () => "sms1"),
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: false,
				status: 400,
				json: async () => ({ message: "Invalid To", code: 21211 }),
			})),
		);

		const result = await sendTwilioSms(ctx as never, {
			organizationId: "org1",
			to: "bad",
			body: "Hello",
			recipientName: "Ada",
		});

		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/Invalid To/);
		expect(ctx.runMutation).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ status: "failed" }),
		);
	});
});
