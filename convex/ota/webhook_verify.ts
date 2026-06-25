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
