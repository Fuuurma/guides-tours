// Tests for OTA webhook signature + timestamp verification.
//
// Covers:
// - HMAC-SHA256 signature match/mismatch
// - Timestamp validation: missing, non-numeric, too old, too future,
//   just-inside-window
// - Combined verifyWebhookSignatureWithTimestamp

import { describe, expect, test } from "vitest";
import {
	checkWebhookTimestamp,
	hmacSha256Hex,
	verifyWebhookSignature,
	verifyWebhookSignatureWithTimestamp,
	WEBHOOK_MAX_AGE_MS,
} from "../ota/webhook_verify";

describe("hmacSha256Hex", () => {
	test("produces deterministic hex digest", async () => {
		const a = await hmacSha256Hex("hello", "secret");
		const b = await hmacSha256Hex("hello", "secret");
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
	});

	test("different payloads produce different digests", async () => {
		const a = await hmacSha256Hex("hello", "secret");
		const b = await hmacSha256Hex("world", "secret");
		expect(a).not.toBe(b);
	});

	test("different secrets produce different digests", async () => {
		const a = await hmacSha256Hex("hello", "secret1");
		const b = await hmacSha256Hex("hello", "secret2");
		expect(a).not.toBe(b);
	});

	test("matches a known RFC 4231 test vector (case 1)", async () => {
		// RFC 4231 Test Case 1: key = 20 bytes of 0x0b, data = "Hi There"
		// expected = b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7
		const key = "\u000b\u000b\u000b\u000b\u000b\u000b\u000b\u000b\u000b\u000b\u000b\u000b\u000b\u000b\u000b\u000b\u000b\u000b\u000b\u000b";
		const got = await hmacSha256Hex("Hi There", key);
		expect(got).toBe(
			"b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
		);
	});
});

describe("verifyWebhookSignature", () => {
	test("accepts matching HMAC signature", async () => {
		const payload = '{"event":"booking.created"}';
		const secret = "test-secret";
		const sig = await hmacSha256Hex(payload, secret);
		expect(await verifyWebhookSignature(payload, sig, secret)).toBe(true);
	});

	test("rejects mismatched signature", async () => {
		const payload = '{"event":"booking.created"}';
		expect(
			await verifyWebhookSignature(payload, "deadbeef", "secret"),
		).toBe(false);
	});

	test("rejects when secret is wrong", async () => {
		const payload = '{"event":"booking.created"}';
		const sig = await hmacSha256Hex(payload, "right-secret");
		expect(
			await verifyWebhookSignature(payload, sig, "wrong-secret"),
		).toBe(false);
	});

	test("rejects malformed hex signature", async () => {
		expect(
			await verifyWebhookSignature("payload", "not-hex!!", "secret"),
		).toBe(false);
	});

	test("rejects signature with wrong length", async () => {
		// Valid hex but truncated to half-length
		expect(
			await verifyWebhookSignature("payload", "abcdef", "secret"),
		).toBe(false);
	});
});

describe("checkWebhookTimestamp", () => {
	const NOW = 1_700_000_000_000;

	test("accepts a current timestamp", () => {
		expect(checkWebhookTimestamp(String(NOW), NOW).valid).toBe(true);
	});

	test("accepts timestamp within max-age window (5 min old)", () => {
		const fiveMinAgo = NOW - WEBHOOK_MAX_AGE_MS;
		expect(checkWebhookTimestamp(String(fiveMinAgo), NOW).valid).toBe(true);
	});

	test("accepts timestamp 5 min in future", () => {
		const fiveMinFuture = NOW + WEBHOOK_MAX_AGE_MS;
		expect(checkWebhookTimestamp(String(fiveMinFuture), NOW).valid).toBe(true);
	});

	test("rejects timestamp older than max-age window", () => {
		const tooOld = NOW - WEBHOOK_MAX_AGE_MS - 1;
		const r = checkWebhookTimestamp(String(tooOld), NOW);
		expect(r.valid).toBe(false);
		expect(r.reason).toBe("too_old");
	});

	test("rejects timestamp too far in future", () => {
		const tooFuture = NOW + WEBHOOK_MAX_AGE_MS + 1;
		const r = checkWebhookTimestamp(String(tooFuture), NOW);
		expect(r.valid).toBe(false);
		expect(r.reason).toBe("too_future");
	});

	test("rejects missing header", () => {
		expect(checkWebhookTimestamp(null, NOW).reason).toBe("missing");
		expect(checkWebhookTimestamp("", NOW).reason).toBe("missing");
	});

	test("rejects non-numeric header", () => {
		expect(checkWebhookTimestamp("not-a-number", NOW).reason).toBe("not_numeric");
		expect(checkWebhookTimestamp("123.45", NOW).reason).toBe("not_numeric");
	});

	test("respects custom maxAgeMs", () => {
		const tenSecAgo = NOW - 10_000;
		const oneSec = 1_000;
		// 10 sec ago is fine with 60 sec window
		expect(checkWebhookTimestamp(String(tenSecAgo), NOW, 60_000).valid).toBe(true);
		// 10 sec ago is too old with 1 sec window
		expect(checkWebhookTimestamp(String(tenSecAgo), NOW, oneSec).reason).toBe("too_old");
	});
});

describe("verifyWebhookSignatureWithTimestamp", () => {
	const NOW = 1_700_000_000_000;
	const SECRET = "test-secret";

	test("accepts valid signature + current timestamp", async () => {
		const payload = '{"event":"booking.created"}';
		const sig = await hmacSha256Hex(payload, SECRET);
		const r = await verifyWebhookSignatureWithTimestamp(
			payload,
			sig,
			String(NOW),
			SECRET,
			NOW,
		);
		expect(r.valid).toBe(true);
		expect(r.signatureOk).toBe(true);
	});

	test("rejects expired timestamp before checking signature", async () => {
		const payload = '{"event":"booking.created"}';
		const sig = await hmacSha256Hex(payload, SECRET);
		const tooOld = String(NOW - WEBHOOK_MAX_AGE_MS - 1);
		const r = await verifyWebhookSignatureWithTimestamp(
			payload,
			sig,
			tooOld,
			SECRET,
			NOW,
		);
		expect(r.valid).toBe(false);
		expect(r.reason).toBe("too_old");
		expect(r.signatureOk).toBe(false);
	});

	test("rejects future timestamp before checking signature", async () => {
		const payload = '{"event":"booking.created"}';
		const sig = await hmacSha256Hex(payload, SECRET);
		const tooFuture = String(NOW + WEBHOOK_MAX_AGE_MS + 1);
		const r = await verifyWebhookSignatureWithTimestamp(
			payload,
			sig,
			tooFuture,
			SECRET,
			NOW,
		);
		expect(r.valid).toBe(false);
		expect(r.reason).toBe("too_future");
	});

	test("rejects missing timestamp", async () => {
		const payload = '{"event":"booking.created"}';
		const sig = await hmacSha256Hex(payload, SECRET);
		const r = await verifyWebhookSignatureWithTimestamp(
			payload,
			sig,
			null,
			SECRET,
			NOW,
		);
		expect(r.valid).toBe(false);
		expect(r.reason).toBe("missing");
	});

	test("rejects valid timestamp + bad signature", async () => {
		const payload = '{"event":"booking.created"}';
		const r = await verifyWebhookSignatureWithTimestamp(
			payload,
			"badsig",
			String(NOW),
			SECRET,
			NOW,
		);
		expect(r.valid).toBe(false);
		expect(r.signatureOk).toBe(false);
		// reason is undefined for signature-only failures
		expect(r.reason).toBeUndefined();
	});

	test("rejects replayed webhook (old captured payload + valid sig)", async () => {
		// Simulates: attacker captured a real webhook 10 minutes ago.
		// The HMAC is still valid, but the timestamp check should reject.
		const payload = '{"event":"booking.created"}';
		const secret = "test-secret";
		const capturedAt = NOW - 10 * 60 * 1000; // 10 min ago
		const sig = await hmacSha256Hex(payload, secret);
		const r = await verifyWebhookSignatureWithTimestamp(
			payload,
			sig,
			String(capturedAt),
			secret,
			NOW,
		);
		expect(r.valid).toBe(false);
		expect(r.reason).toBe("too_old");
	});
});
