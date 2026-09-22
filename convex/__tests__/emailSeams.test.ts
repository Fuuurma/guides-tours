// Unit tests for the email seams: convex/lib/sendEmail (shared SES
// sender) and convex/lib/inviteEmail (Better Auth invitation hook).
// F19 coverage gap — both previously had zero direct tests.
//
// Pins the documented delivery contracts: skip (never throw) when SES
// env is unconfigured, with the missing vars named; "failed" (never
// throw) on transport/SES errors; signed-request routing to SES; the
// SITE_URL requirement on invites; and the HTML-escaping of
// user-provided fields in the invitation HTML body.

import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTemplatedEmail } from "../lib/sendEmail";
import { sendInvitationEmail } from "../lib/inviteEmail";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

function stubSesConfigured() {
	vi.stubEnv("AWS_REGION", "eu-west-1");
	vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIA_TEST");
	vi.stubEnv("AWS_SECRET_ACCESS_KEY", "shhh");
	vi.stubEnv("SES_FROM_ADDRESS", "no-reply@guides.example");
}

describe("sendEmail.sendTemplatedEmail — unconfigured SES", () => {
	it("skips with every missing var named", async () => {
		vi.stubEnv("AWS_REGION", undefined);
		vi.stubEnv("AWS_ACCESS_KEY_ID", undefined);
		vi.stubEnv("AWS_SECRET_ACCESS_KEY", undefined);
		vi.stubEnv("SES_FROM_ADDRESS", undefined);
		const out = await sendTemplatedEmail({
			to: "a@b.example",
			subject: "hi",
			bodyText: "hello",
		});
		expect(out.status).toBe("skipped");
		if (out.status === "skipped") {
			for (const name of [
				"AWS_REGION",
				"AWS_ACCESS_KEY_ID",
				"AWS_SECRET_ACCESS_KEY",
				"SES_FROM_ADDRESS",
			]) {
				expect(out.reason).toContain(name);
			}
		}
	});

	it("names exactly the still-missing vars", async () => {
		vi.stubEnv("AWS_REGION", undefined);
		vi.stubEnv("AWS_ACCESS_KEY_ID", undefined);
		vi.stubEnv("AWS_SECRET_ACCESS_KEY", undefined);
		vi.stubEnv("SES_FROM_ADDRESS", "from@guides.example");
		const out = await sendTemplatedEmail({
			to: "a@b.example",
			subject: "hi",
			bodyText: "hello",
		});
		expect(out.status).toBe("skipped");
		if (out.status === "skipped") {
			expect(out.reason).toContain("AWS_REGION");
			expect(out.reason).not.toContain("SES_FROM_ADDRESS");
		}
	});
});

describe("sendEmail.sendTemplatedEmail — configured", () => {
	it("sends a signed POST and reports sent", async () => {
		stubSesConfigured();
		const fetchMock = vi.fn(async () => new Response("<ok/>", { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const out = await sendTemplatedEmail({
			to: "guest@example.com",
			subject: "See you soon",
			bodyText: "plain",
			bodyHtml: "<p>rich</p>",
		});
		expect(out.status).toBe("sent");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			{ method: string; body: string },
		];
		expect(init.method).toBe("POST");
		expect(url).toBe("https://email.eu-west-1.amazonaws.com/");
		expect(init.body).toContain("guest@example.com");
		expect(init.body).toContain("See you soon");
	});

	it("returns failed on fetch rejection without throwing", async () => {
		stubSesConfigured();
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network down");
			}),
		);
		const out = await sendTemplatedEmail({
			to: "a@b.example",
			subject: "hi",
			bodyText: "hello",
		});
		expect(out).toEqual({
			status: "failed",
			error: "fetch error: network down",
		});
	});

	it("returns failed with the SES status on non-2xx", async () => {
		stubSesConfigured();
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("<boom/>", { status: 503 })),
		);
		const out = await sendTemplatedEmail({
			to: "a@b.example",
			subject: "hi",
			bodyText: "hello",
		});
		expect(out.status).toBe("failed");
		if (out.status === "failed") {
			expect(out.error).toContain("SES 503:");
		}
	});
});

describe("inviteEmail.sendInvitationEmail", () => {
	it("requires SITE_URL", async () => {
		vi.stubEnv("SITE_URL", undefined);
		await expect(
			sendInvitationEmail({
				id: "inv_1",
				email: "guide@example.com",
				organization: { name: "Tours Co" },
			}),
		).rejects.toThrow("SITE_URL must be set");
	});

	it("escapes user-provided fields in the HTML body and never throws on skip", async () => {
		vi.stubEnv("SITE_URL", "https://app.example");
		// SES intentionally unconfigured → skipped path.
		vi.stubEnv("AWS_REGION", undefined);
		vi.stubEnv("AWS_ACCESS_KEY_ID", undefined);
		vi.stubEnv("AWS_SECRET_ACCESS_KEY", undefined);
		vi.stubEnv("SES_FROM_ADDRESS", undefined);
		await expect(
			sendInvitationEmail({
				id: "inv_1",
				email: "guide@example.com",
				organization: { name: "Tours Co" },
			}),
		).resolves.toBeUndefined();
	});

	it("escapes HTML-dangerous org names in the rendered body", async () => {
		vi.stubEnv("SITE_URL", "https://app.example");
		stubSesConfigured();
		let captured = "";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: unknown, init: { body: string }) => {
				captured = init.body;
				return new Response("<ok/>", { status: 200 });
			}),
		);
		await sendInvitationEmail({
			id: "inv_9",
			email: "guide@example.com",
			organization: { name: '<script>alert("x")</script>' },
		});
		expect(captured).not.toContain("<script>");
		expect(captured).toContain("&lt;script&gt;");
		expect(captured).toContain("https://app.example/invite/inv_9");
	});
});
