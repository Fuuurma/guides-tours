// Symmetric encryption helpers for sensitive string fields.
//
// Used by:
// - otaIntegrations.apiKey / apiSecret / webhookSecret
// - paymentSettings.stripeSecretKey / stripeWebhookSecret
// - notificationSettings.twilioAuthToken
//
// Algorithm: AES-256-GCM. Authenticated encryption — GCM's auth tag
// detects tampering. Format on disk: <iv_hex>:<ciphertext_hex>:<tag_hex>.
//
// Key: read from process.env.ENCRYPTION_KEY. Must be 32 bytes (64 hex
// chars) or 32 raw chars. Set via:
//   npx convex env set ENCRYPTION_KEY=$(openssl rand -hex 32)
// Or via the Convex dashboard.
//
// Node's crypto module is available in Convex functions (per
// CONVENTIONS.md — Node.js compat is the default for actions).
//
// IMPORTANT: This module is isomorphic in the sense that the encrypt()
// output is stable string format. Decrypt works on any runtime that
// has Node's crypto (Convex actions, vitest in Node, etc.). It does
// NOT work in the browser — the client never holds the key.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit IV — GCM standard
const KEY_HEX_LENGTH = 64; // 32 bytes as hex

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
	if (cachedKey) return cachedKey;
	const raw = process.env.ENCRYPTION_KEY;
	if (!raw) {
		throw new Error(
			"ENCRYPTION_KEY env var not set. Set it via `npx convex env set ENCRYPTION_KEY=$(openssl rand -hex 32)`",
		);
	}
	let key: Buffer;
	if (raw.length === KEY_HEX_LENGTH) {
		key = Buffer.from(raw, "hex");
	} else if (raw.length === 32) {
		key = Buffer.from(raw, "utf8");
	} else {
		throw new Error(
			`ENCRYPTION_KEY must be 32 bytes (got ${raw.length}). Use \`openssl rand -hex 32\` or a 32-char string.`,
		);
	}
	if (key.length !== 32) {
		throw new Error(`ENCRYPTION_KEY decoded to ${key.length} bytes, need 32`);
	}
	cachedKey = key;
	return key;
}

/** Encrypt a plaintext string. Returns "iv:ciphertext:tag" hex. */
export function encrypt(plaintext: string): string {
	const key = getKey();
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGO, key, iv);
	const ct = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return `${iv.toString("hex")}:${ct.toString("hex")}:${tag.toString("hex")}`;
}

/** Decrypt a ciphertext produced by encrypt(). */
export function decrypt(payload: string): string {
	const parts = payload.split(":");
	if (parts.length !== 3) {
		throw new Error("invalid ciphertext format (expected iv:ct:tag)");
	}
	const [ivHex, ctHex, tagHex] = parts as [string, string, string];
	const key = getKey();
	const iv = Buffer.from(ivHex, "hex");
	const ct = Buffer.from(ctHex, "hex");
	const tag = Buffer.from(tagHex, "hex");
	const decipher = createDecipheriv(ALGO, key, iv);
	decipher.setAuthTag(tag);
	const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
	return pt.toString("utf8");
}

/**
 * Reset the cached key. Test-only — lets you change ENCRYPTION_KEY
 * mid-suite and re-derive. Never call from production code.
 */
export function _resetKeyForTest(): void {
	cachedKey = null;
}
