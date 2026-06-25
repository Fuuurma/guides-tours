// Stripe webhook signature verification.
//
// Stripe sends `stripe-signature: t=<timestamp>,v1=<sig>` where
// `<sig>` is HMAC-SHA256 over `<timestamp>.<raw_payload>` using
// the endpoint signing secret. We tolerate a small clock skew
// (default 5 minutes — Stripe's recommended max).
//
// Uses Web Crypto API (globalThis.crypto.subtle) like our other
// crypto — no node:crypto needed.

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

/**
 * Parse a Stripe-Signature header into its components.
 *
 * Format: "t=1234567890,v1=abc...,v0=def..." (signed elements are
 * comma-separated key=value pairs; we only consume `t` and `v1`).
 */
export function parseStripeSignature(header: string): {
	timestamp: number;
	signature: string;
} | null {
	let timestamp = 0;
	let signature = "";
	for (const part of header.split(",")) {
		const eq = part.indexOf("=");
		if (eq < 0) continue;
		const key = part.slice(0, eq).trim();
		const value = part.slice(eq + 1).trim();
		if (key === "t") {
			const n = Number(value);
			if (Number.isFinite(n)) timestamp = n;
		} else if (key === "v1") {
			signature = value;
		}
	}
	if (!timestamp || !signature) return null;
	return { timestamp, signature };
}

const DEFAULT_TOLERANCE_SECONDS = 300; // 5 min, Stripe's max

/**
 * Verify a Stripe webhook signature. Returns true if valid.
 *
 * @param payload   Raw request body as string or Buffer
 * @param header    The `stripe-signature` header value
 * @param secret    Stripe endpoint signing secret (whsec_...)
 * @param now       Current time in ms (defaults to Date.now(); tests pass)
 * @param tolerance Max age in seconds (defaults to 300)
 */
export async function verifyStripeSignature(
	payload: string | Uint8Array,
	header: string,
	secret: string,
	now: number = Date.now(),
	tolerance: number = DEFAULT_TOLERANCE_SECONDS,
): Promise<boolean> {
	const parsed = parseStripeSignature(header);
	if (!parsed) return false;
	const ageSec = Math.abs(now / 1000 - parsed.timestamp);
	if (ageSec > tolerance) return false;

	const payloadStr =
		typeof payload === "string"
			? payload
			: new TextDecoder().decode(payload);
	const signed = `${parsed.timestamp}.${payloadStr}`;
	const keyBytes = new TextEncoder().encode(secret);
	const key = await getCrypto().subtle.importKey(
		"raw",
		keyBytes as BufferSource,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sigBytes = new TextEncoder().encode(signed);
	const src = new Uint8Array(
		sigBytes.buffer,
		sigBytes.byteOffset,
		sigBytes.byteLength,
	);
	const copy = new Uint8Array(src.byteLength);
	copy.set(src);
	const sigBuf = await getCrypto().subtle.sign("HMAC", key, copy.buffer);
	const expected = toHex(new Uint8Array(sigBuf));
	let expectedBytes: Uint8Array;
	let signatureBytes: Uint8Array;
	try {
		expectedBytes = fromHex(expected);
		signatureBytes = fromHex(parsed.signature);
	} catch {
		return false;
	}
	return timingSafeEqual(expectedBytes, signatureBytes);
}