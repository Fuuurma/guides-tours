// Generic webhook signature verification.
//
// Uses Web Crypto API (globalThis.crypto.subtle) for HMAC-SHA256.
// Works in the Convex default runtime, Convex Node.js runtime,
// Node 20+, and modern browsers. No node-specific imports needed.
//
// Every OTA in source uses HMAC-SHA256 over the raw request body,
// compared to a per-provider secret using timing-safe equality.
//
// Source's pattern (Python):
//     hmac.new(secret.encode(), payload, hashlib.sha256)
//     hmac.compare_digest(signature, expected)
// Web Crypto's SubtleCrypto gives us the same primitives.

function getCrypto(): Crypto {
	const c = (globalThis as { crypto?: Crypto }).crypto;
	if (!c?.subtle) {
		throw new Error("Web Crypto API unavailable");
	}
	return c;
}

function toHex(bytes: Uint8Array): string {
	let out = "";
	for (let i = 0; i < bytes.length; i++) {
		out += bytes[i]!.toString(16).padStart(2, "0");
	}
	return out;
}

function fromHex(hex: string): Uint8Array {
	if (hex.length % 2 !== 0) throw new Error("invalid hex length");
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
	}
	return diff === 0;
}

async function hmacSha256Hex(
	payload: string | Buffer | Uint8Array,
	secret: string,
): Promise<string> {
	const keyBytes = new TextEncoder().encode(secret);
	const key = await getCrypto().subtle.importKey(
		"raw",
		keyBytes as BufferSource,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	let data: ArrayBuffer;
	if (typeof payload === "string") {
		data = new TextEncoder().encode(payload).buffer as ArrayBuffer;
	} else {
		// Copy into a fresh ArrayBuffer so the runtime sees a plain
		// ArrayBuffer (not ArrayBufferLike which can be SharedArrayBuffer).
		const src = new Uint8Array(
			payload.buffer,
			payload.byteOffset,
			payload.byteLength,
		);
		const copy = new Uint8Array(src.byteLength);
		copy.set(src);
		data = copy.buffer;
	}
	const sigBuf = await getCrypto().subtle.sign("HMAC", key, data);
	return toHex(new Uint8Array(sigBuf));
}

/**
 * Compute the HMAC-SHA256 hex signature for a payload. Exposed so
 * tests + provider-specific helpers can use it.
 */
export { hmacSha256Hex };

/**
 * Verify a webhook signature.
 *
 * @param payload   - raw request body as string or Buffer
 * @param signature - signature as sent in the webhook header (hex)
 * @param secret    - per-provider webhook secret stored encrypted in
 *                    otaIntegrations.webhookSecret
 * @returns true if the signature matches, false otherwise
 */
export async function verifyWebhookSignature(
	payload: string | Buffer | Uint8Array,
	signature: string,
	secret: string,
): Promise<boolean> {
	const expected = await hmacSha256Hex(payload, secret);
	if (signature.length !== expected.length) return false;
	try {
		return timingSafeEqual(fromHex(signature), fromHex(expected));
	} catch {
		return false;
	}
}

/**
 * Per-provider webhook header name.
 */
export const WEBHOOK_HEADER = {
	viator: "x-viator-signature",
	getYourGuide: "x-getyourguide-signature",
	airbnb: "x-airbnb-signature",
	tripAdvisor: "x-tripadvisor-signature",
	klook: "x-klook-signature",
	booking: "x-booking-signature",
	expedia: "x-expedia-signature",
} as const;

export type ProviderSlug = keyof typeof WEBHOOK_HEADER;

/**
 * Per-provider timestamp header name. OTAs typically include this
 * as the epoch-seconds (or ms) they signed the payload, so we can
 * reject replays of old captured payloads.
 *
 * Header value: epoch milliseconds (integer string).
 */
export const WEBHOOK_TIMESTAMP_HEADER = {
	viator: "x-viator-timestamp",
	getYourGuide: "x-getyourguide-timestamp",
	airbnb: "x-airbnb-timestamp",
	tripAdvisor: "x-tripadvisor-timestamp",
	klook: "x-klook-timestamp",
	booking: "x-booking-timestamp",
	expedia: "x-expedia-timestamp",
} as const;

/**
 * How old a webhook timestamp can be (and how far in the future)
 * before we reject it. 5 minutes is a common default (Stripe, GitHub)
 * — covers clock skew while preventing long-window replay attacks.
 */
export const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

export interface TimestampCheckResult {
	valid: boolean;
	/** When valid is false, why. Useful for logging / metrics. */
	reason?: "missing" | "not_numeric" | "too_old" | "too_future";
}

/**
 * Check whether a webhook timestamp is within an acceptable window.
 *
 * Pure function — no signature/HMAC logic, no I/O. Tests assert
 * boundary conditions without needing a fake clock.
 */
export function checkWebhookTimestamp(
	timestampHeader: string | null,
	nowMs: number = Date.now(),
	maxAgeMs: number = WEBHOOK_MAX_AGE_MS,
): TimestampCheckResult {
	if (timestampHeader === null || timestampHeader === "") {
		return { valid: false, reason: "missing" };
	}
	// Reject anything that isn't a pure integer string. parseInt is
	// too lenient — "123.45" would parse as 123 and slip through.
	if (!/^-?\d+$/.test(timestampHeader)) {
		return { valid: false, reason: "not_numeric" };
	}
	const ts = Number.parseInt(timestampHeader, 10);
	if (!Number.isFinite(ts)) {
		return { valid: false, reason: "not_numeric" };
	}
	if (ts < nowMs - maxAgeMs) {
		return { valid: false, reason: "too_old" };
	}
	if (ts > nowMs + maxAgeMs) {
		return { valid: false, reason: "too_future" };
	}
	return { valid: true };
}

/**
 * Verify a webhook signature + timestamp window.
 *
 * The signature is still HMAC over the body only (matches what real
 * OTAs send). The timestamp header is checked separately against
 * an acceptable window — protects against replay of old captured
 * payloads without breaking provider compatibility.
 */
export async function verifyWebhookSignatureWithTimestamp(
	payload: string | Buffer | Uint8Array,
	signature: string,
	timestampHeader: string | null,
	secret: string,
	nowMs?: number,
): Promise<TimestampCheckResult & { signatureOk: boolean }> {
	const tsCheck = checkWebhookTimestamp(timestampHeader, nowMs);
	if (!tsCheck.valid) {
		return { ...tsCheck, signatureOk: false };
	}
	const signatureOk = await verifyWebhookSignature(payload, signature, secret);
	if (!signatureOk) {
		return { valid: false, reason: undefined, signatureOk: false };
	}
	return { valid: true, signatureOk: true };
}
