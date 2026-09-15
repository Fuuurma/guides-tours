import { describe, expect, it, beforeEach } from "vitest";
import {
	verifyWebhookSignature,
	verifyWebhookSignatureWithTimestamp,
	checkWebhookTimestamp,
	hmacSha256Hex,
	WEBHOOK_MAX_AGE_MS,
} from "../webhook_verify";

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

	describe("checkWebhookTimestamp", () => {
		const NOW = 1_700_000_000_000;

		it("skips (valid) when the header is absent by default", () => {
			expect(checkWebhookTimestamp(null, NOW)).toEqual({
				valid: true,
				reason: "skipped",
			});
			expect(checkWebhookTimestamp("", NOW)).toEqual({
				valid: true,
				reason: "skipped",
			});
		});

		it("rejects (missing) when the header is absent and requireTimestamp is set", () => {
			expect(
				checkWebhookTimestamp(null, NOW, undefined, {
					requireTimestamp: true,
				}),
			).toEqual({ valid: false, reason: "missing" });
			expect(
				checkWebhookTimestamp("", NOW, undefined, { requireTimestamp: true }),
			).toEqual({ valid: false, reason: "missing" });
		});

		it("accepts a fresh timestamp regardless of requireTimestamp", () => {
			const fresh = String(NOW - 1000);
			expect(checkWebhookTimestamp(fresh, NOW)).toEqual({ valid: true });
			expect(
				checkWebhookTimestamp(fresh, NOW, undefined, {
					requireTimestamp: true,
				}),
			).toEqual({ valid: true });
		});

		it("rejects non-numeric headers", () => {
			expect(checkWebhookTimestamp("12.45", NOW)).toEqual({
				valid: false,
				reason: "not_numeric",
			});
			expect(checkWebhookTimestamp("abc", NOW)).toEqual({
				valid: false,
				reason: "not_numeric",
			});
		});

		it("enforces the replay window on both edges", () => {
			const tooOld = String(NOW - WEBHOOK_MAX_AGE_MS - 1);
			const tooFuture = String(NOW + WEBHOOK_MAX_AGE_MS + 1);
			const edgeOld = String(NOW - WEBHOOK_MAX_AGE_MS);
			const edgeFuture = String(NOW + WEBHOOK_MAX_AGE_MS);
			expect(checkWebhookTimestamp(tooOld, NOW)).toEqual({
				valid: false,
				reason: "too_old",
			});
			expect(checkWebhookTimestamp(tooFuture, NOW)).toEqual({
				valid: false,
				reason: "too_future",
			});
			expect(checkWebhookTimestamp(edgeOld, NOW).valid).toBe(true);
			expect(checkWebhookTimestamp(edgeFuture, NOW).valid).toBe(true);
		});
	});

	describe("verifyWebhookSignatureWithTimestamp", () => {
		const payload = JSON.stringify({ eventType: "BOOKING_CREATED" });
		const secret = "shh";

		it("defaults to skip-on-missing-header (valid, signature still checked)", async () => {
			const sig = await signWithNode(payload, secret);
			const result = await verifyWebhookSignatureWithTimestamp(
				payload,
				sig,
				null,
				secret,
			);
			expect(result).toEqual({
				valid: true,
				reason: "skipped",
				signatureOk: true,
			});
		});

		it("requireTimestamp rejects a missing header before signature work", async () => {
			const sig = await signWithNode(payload, secret);
			const result = await verifyWebhookSignatureWithTimestamp(
				payload,
				sig,
				null,
				secret,
				undefined,
				{ requireTimestamp: true },
			);
			expect(result).toEqual({
				valid: false,
				reason: "missing",
				signatureOk: false,
			});
		});

		it("accepts valid signature + fresh timestamp", async () => {
			const sig = await signWithNode(payload, secret);
			const result = await verifyWebhookSignatureWithTimestamp(
				payload,
				sig,
				String(Date.now()),
				secret,
			);
			expect(result).toEqual({ valid: true, signatureOk: true });
		});
	});
});
