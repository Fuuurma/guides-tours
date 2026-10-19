import { beforeEach, describe, expect, it, vi } from "vitest";
import { timingSafeEqual } from "../../lib/timing";
import { verifyWebhookSignature } from "../webhook_verify";

/**
 * F852: verifyWebhookSignature kept a wrong-length early return one frame
 * ABOVE the constant-time compare, so a wrong-length signature answered
 * before timingSafeEqual ever ran — the length-vs-content timing
 * distinction the F466 constant-time contract exists to erase survived
 * in the public verify path.
 *
 * The boolean contract cannot see this: both paths answer false. So the
 * pin makes the COMPARE observable — the shared primitive is mocked with
 * a spy that delegates to the real implementation, and the test asserts
 * the compare was actually reached.
 */
vi.mock("../../lib/timing", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../lib/timing")>();
	return {
		...actual,
		timingSafeEqual: vi.fn(actual.timingSafeEqual),
	};
});

const compare = vi.mocked(timingSafeEqual);

describe("verifyWebhookSignature (F852 no length early-return)", () => {
	beforeEach(() => {
		compare.mockClear();
	});

	it("reaches the constant-time compare for a wrong-length signature", async () => {
		// 62 hex chars — even length, valid hex, so fromHex succeeds and
		// the compare is reached. Before the fix the length check returned
		// first and the compare never ran.
		const wrongLength = "a".repeat(62);
		expect(
			await verifyWebhookSignature("payload", wrongLength, "shh"),
		).toBe(false);
		expect(compare).toHaveBeenCalledTimes(1);
	});

	it("reaches the constant-time compare for a full-length wrong signature", async () => {
		const wrong = "b".repeat(64);
		expect(await verifyWebhookSignature("payload", wrong, "shh")).toBe(false);
		expect(compare).toHaveBeenCalledTimes(1);
	});

	it("still rejects a malformed signature without throwing", async () => {
		// Odd length -> fromHex throws -> caught -> false. The parse
		// failure is about the caller's own input, which the caller
		// already knows, so it leaks nothing about the secret.
		expect(await verifyWebhookSignature("payload", "abc", "shh")).toBe(false);
		expect(await verifyWebhookSignature("payload", "not-hex-z", "shh")).toBe(
			false,
		);
	});

	it("accepts a signature computed with the same secret", async () => {
		const { createHmac } = await import("node:crypto");
		const payload = "payload";
		const secret = "shh";
		const sig = createHmac("sha256", secret).update(payload).digest("hex");
		expect(await verifyWebhookSignature(payload, sig, secret)).toBe(true);
		expect(compare).toHaveBeenCalledTimes(1);
	});
});
