// For encryption: AES-256-GCM, hex-encoded output (iv:ct:tag).
//
// Uses Web Crypto API (globalThis.crypto.subtle) which is available
// in the Convex default runtime, Convex Node.js runtime, Node 20+,
// and modern browsers. No node-specific imports needed.
//
// Key: read from process.env.ENCRYPTION_KEY. Must be 32 bytes (64 hex
// chars) or 32 raw chars. Set via:
//   npx convex env set ENCRYPTION_KEY=$(openssl rand -hex 32)
//
// Decrypt works on any runtime that has WebCrypto (Convex default
// runtime, Convex Node.js runtime, vitest in Node). On the browser
// the client never holds the key.

const ALGO = "AES-GCM";
const IV_BYTES = 12; // 96-bit IV — GCM standard
const KEY_HEX_LENGTH = 64; // 32 bytes as hex

function getCrypto(): Crypto {
	// On Convex Cloud default runtime + Node 20+ + browsers, this is
	// globalThis.crypto. The Node `node:crypto` webcrypto export is a
	// re-export of the same API; we don't import it (avoids needing
	// the "use node" directive).
	const c = (globalThis as { crypto?: Crypto }).crypto;
	if (!c?.subtle) {
		throw new Error(
			"Web Crypto API unavailable — ENCRYPTION_KEY cannot be used",
		);
	}
	return c;
}

function getKeyMaterial(): Uint8Array {
	const raw = process.env.ENCRYPTION_KEY;
	if (!raw) {
		throw new Error(
			"ENCRYPTION_KEY env var not set. Set it via `npx convex env set ENCRYPTION_KEY=$(openssl rand -hex 32)`",
		);
	}
	if (raw.length === KEY_HEX_LENGTH) {
		const bytes = new Uint8Array(KEY_HEX_LENGTH / 2);
		for (let i = 0; i < bytes.length; i++) {
			bytes[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16);
		}
		return bytes;
	}
	if (raw.length === 32) {
		return new TextEncoder().encode(raw);
	}
	throw new Error(
		`ENCRYPTION_KEY must be 32 bytes (got ${raw.length}). Use \`openssl rand -hex 32\` or a 32-char string.`,
	);
}

let cachedKey: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
	if (cachedKey) return cachedKey;
	const material = getKeyMaterial();
	if (material.length !== 32) {
		throw new Error(`ENCRYPTION_KEY decoded to ${material.length} bytes, need 32`);
	}
	// Copy into a plain ArrayBuffer so subtle.importKey's
	// BufferSource accepts it (Uint8Array<ArrayBufferLike> from
	// fromHex is rejected — ArrayBufferLike can be SharedArrayBuffer).
	const copy = new Uint8Array(material.byteLength);
	copy.set(material);
	cachedKey = await getCrypto().subtle.importKey(
		"raw",
		copy.buffer as ArrayBuffer,
		{ name: ALGO },
		false,
		["encrypt", "decrypt"],
	);
	return cachedKey;
}

/** Reset the cached key. Test-only. */
export function _resetKeyForTest(): void {
	cachedKey = null;
}

/** Encrypt a plaintext string. Returns "iv_hex:ct_hex:tag_hex". */
export async function encrypt(plaintext: string): Promise<string> {
	const key = await getKey();
	const iv = getCrypto().getRandomValues(new Uint8Array(IV_BYTES));
	const data = new Uint8Array(
		new TextEncoder().encode(plaintext),
	).buffer as ArrayBuffer;
	const ctBuf = await getCrypto().subtle.encrypt(
		{ name: ALGO, iv: iv as BufferSource, tagLength: 128 },
		key,
		data,
	);
	// Web Crypto appends the 16-byte auth tag to the ciphertext.
	const ct = new Uint8Array(ctBuf);
	const tag = ct.slice(ct.length - 16);
	const body = ct.slice(0, ct.length - 16);
	return `${toHex(iv)}:${toHex(body)}:${toHex(tag)}`;
}

/** Decrypt a ciphertext produced by encrypt(). */
export async function decrypt(payload: string): Promise<string> {
	const parts = payload.split(":");
	if (parts.length !== 3) {
		throw new Error("invalid ciphertext format (expected iv:ct:tag)");
	}
	const [ivHex, ctHex, tagHex] = parts as [string, string, string];
	const key = await getKey();
	const iv = fromHex(ivHex);
	const body = fromHex(ctHex);
	const tag = fromHex(tagHex);
	// Re-attach tag to ciphertext (Web Crypto expects it joined).
	const joined = new Uint8Array(body.length + tag.length);
	joined.set(body, 0);
	joined.set(tag, body.length);
	const data = joined.buffer as ArrayBuffer;
	const ptBuf = await getCrypto().subtle.decrypt(
		{ name: ALGO, iv: iv as BufferSource, tagLength: 128 },
		key,
		data,
	);
	return new TextDecoder().decode(ptBuf);
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
