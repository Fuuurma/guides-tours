import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { sendTemplatedEmail } from "../sendEmail";

describe("sendTemplatedEmail", () => {
	const originalEnv = { ...process.env };
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		// Reset all SES-related env vars before each test.
		delete process.env.AWS_REGION;
		delete process.env.AWS_ACCESS_KEY_ID;
		delete process.env.AWS_SECRET_ACCESS_KEY;
		delete process.env.SES_FROM_ADDRESS;
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		vi.unstubAllGlobals();
	});

	it("returns skipped when SES env vars are unset", async () => {
		const result = await sendTemplatedEmail({
			to: "user@example.com",
			subject: "hi",
			bodyText: "hello",
		});
		expect(result.status).toBe("skipped");
		if (result.status === "skipped") {
			expect(result.reason).toMatch(/AWS_REGION/);
		}
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("returns skipped when only some SES env vars are set", async () => {
		process.env.AWS_REGION = "us-east-1";
		process.env.AWS_ACCESS_KEY_ID = "AKIA";
		// missing AWS_SECRET_ACCESS_KEY and SES_FROM_ADDRESS
		const result = await sendTemplatedEmail({
			to: "user@example.com",
			subject: "hi",
			bodyText: "hello",
		});
		expect(result.status).toBe("skipped");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("calls fetch with a signed SES request when env is complete", async () => {
		process.env.AWS_REGION = "us-east-1";
		process.env.AWS_ACCESS_KEY_ID = "AKIAFAKEKEY";
		process.env.AWS_SECRET_ACCESS_KEY = "fakesecretkey";
		process.env.SES_FROM_ADDRESS = "noreply@example.com";
		fetchSpy.mockResolvedValueOnce(
			new Response("", { status: 200 }),
		);

		const result = await sendTemplatedEmail({
			to: "user@example.com",
			subject: "hi",
			bodyText: "hello",
			bodyHtml: "<p>hello</p>",
		});
		expect(result.status).toBe("sent");
		expect(fetchSpy).toHaveBeenCalledOnce();
		const [url, init] = fetchSpy.mock.calls[0]!;
		expect(url).toMatch(/^https:\/\/email\.us-east-1\.amazonaws\.com\//);
		expect(init.method).toBe("POST");
		expect(init.headers.Authorization).toMatch(
			/^AWS4-HMAC-SHA256 Credential=AKIAFAKEKEY\//,
		);
		expect(init.headers.Host).toBe("email.us-east-1.amazonaws.com");
		expect(init.body).toMatch(/<Source>noreply@example\.com<\/Source>/);
	});

	it("returns failed on transport error", async () => {
		process.env.AWS_REGION = "us-east-1";
		process.env.AWS_ACCESS_KEY_ID = "AKIAFAKEKEY";
		process.env.AWS_SECRET_ACCESS_KEY = "fakesecretkey";
		process.env.SES_FROM_ADDRESS = "noreply@example.com";
		fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));

		const result = await sendTemplatedEmail({
			to: "user@example.com",
			subject: "hi",
			bodyText: "hello",
		});
		expect(result.status).toBe("failed");
		if (result.status === "failed") {
			expect(result.error).toMatch(/fetch error: ECONNREFUSED/);
		}
	});

	it("returns failed on non-2xx SES response", async () => {
		process.env.AWS_REGION = "us-east-1";
		process.env.AWS_ACCESS_KEY_ID = "AKIAFAKEKEY";
		process.env.AWS_SECRET_ACCESS_KEY = "fakesecretkey";
		process.env.SES_FROM_ADDRESS = "noreply@example.com";
		fetchSpy.mockResolvedValueOnce(
			new Response("MessageRejected: bad address", { status: 400 }),
		);

		const result = await sendTemplatedEmail({
			to: "user@example.com",
			subject: "hi",
			bodyText: "hello",
		});
		expect(result.status).toBe("failed");
		if (result.status === "failed") {
			expect(result.error).toMatch(/SES 400/);
			expect(result.error).toMatch(/MessageRejected/);
		}
	});

	it("uses the override `from` param when provided", async () => {
		process.env.AWS_REGION = "us-east-1";
		process.env.AWS_ACCESS_KEY_ID = "AKIAFAKEKEY";
		process.env.AWS_SECRET_ACCESS_KEY = "fakesecretkey";
		process.env.SES_FROM_ADDRESS = "default@example.com";
		fetchSpy.mockResolvedValueOnce(
			new Response("", { status: 200 }),
		);

		await sendTemplatedEmail({
			to: "user@example.com",
			subject: "hi",
			bodyText: "hello",
			from: "custom@example.com",
		});
		const [, init] = fetchSpy.mock.calls[0]!;
		expect(init.body).toMatch(/<Source>custom@example\.com<\/Source>/);
	});
});
