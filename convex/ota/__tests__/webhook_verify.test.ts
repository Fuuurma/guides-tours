import { describe, expect, it, beforeEach } from "vitest";
import { verifyWebhookSignature, hmacSha256Hex } from "../webhook_verify";

// Test helper: compute the signature the same way the OTA would
// and verify our code accepts it. Uses Node's crypto to sign so the
// test is independent of our own implementation.

async function signWithNode(
	payload: string,
	secret: string,
): Promise<string> {
	const { createHmac } = await import("node:crypto");
	return createHmac("sha256", secret).update(payload).digest("hex");
}

describe("convex/ota/webhook_verify", () => {
	beforeEach(() => {
		// Force-clean any global state
	});

	describe("verifyWebhookSignature", () => {
		it("accepts a signature computed with the same secret", async () => {
			const payload = JSON.stringify({ eventType: "BOOKING_CREATED" });
			const secret = "shh";
			const sig = await signWithNode(payload, secret);
			expect(await verifyWebhookSignature(payload, sig, secret)).toBe(true);
		});

		it("rejects a signature computed with a different secret", async () => {
			const payload = JSON.stringify({ eventType: "BOOKING_CREATED" });
			const sig = await signWithNode(payload, "shh");
			expect(await verifyWebhookSignature(payload, sig, "other-secret")).toBe(
				false,
			);
		});

		it("rejects when the payload is tampered", async () => {
			const payload = JSON.stringify({ eventType: "BOOKING_CREATED" });
			const secret = "shh";
			const sig = await signWithNode(payload, secret);
			const tampered = payload.replace("BOOKING_CREATED", "BOOKING_CANCELLED");
			expect(await verifyWebhookSignature(tampered, sig, secret)).toBe(false);
		});

		it("rejects signature with wrong length (timing-safe check guard)", async () => {
			const payload = "x";
			expect(await verifyWebhookSignature(payload, "abc", "shh")).toBe(false);
		});

		it("rejects malformed hex signature", async () => {
			const payload = "x";
			expect(await verifyWebhookSignature(payload, "not-hex-z", "shh")).toBe(
				false,
			);
		});

		it("accepts Buffer payloads (not just strings)", async () => {
			const payload = Buffer.from("hello", "utf8");
			const secret = "shh";
			const sig = await signWithNode(payload.toString("binary"), secret);
			// Note: when OTA sends binary, the signature was computed over
			// the raw bytes — caller is responsible for matching the
			// encoding. We pass through whatever they give us.
			expect(await verifyWebhookSignature(payload, sig, secret)).toBe(true);
		});
	});

	describe("hmacSha256Hex", () => {
		it("matches Node's crypto for empty payload", async () => {
			const our = await hmacSha256Hex("", "secret");
			const { createHmac } = await import("node:crypto");
			const theirs = createHmac("sha256", "secret").update("").digest("hex");
			expect(our).toBe(theirs);
		});

		it("matches Node's crypto for non-empty payload", async () => {
			const our = await hmacSha256Hex("hello world", "shh");
			const { createHmac } = await import("node:crypto");
			const theirs = createHmac("sha256", "shh")
				.update("hello world")
				.digest("hex");
			expect(our).toBe(theirs);
		});
	});
});
