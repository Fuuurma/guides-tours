// Tests for convex/lib/crypto.ts — AES-256-GCM round-trip.
//
// Uses Web Crypto API so it works in Node, Convex runtime, and
// Cloudflare Workers without node-specific imports.

import { describe, expect, it } from "vitest";
import { encrypt, decrypt, _resetKeyForTest } from "../lib/crypto";

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

describe("convex/lib/crypto", () => {

	it("encrypts + decrypts a short string", async () => {
		const plaintext = "hello world";
		const ct = await encrypt(plaintext);
		expect(ct).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
		const pt = await decrypt(ct);
		expect(pt).toBe(plaintext);
	});

	it("encrypts + decrypts an empty string", async () => {
		const ct = await encrypt("");
		const pt = await decrypt(ct);
		expect(pt).toBe("");
	});

	it("encrypts + decrypts a long string (>1 KB)", async () => {
		const plaintext = "x".repeat(4096);
		const ct = await encrypt(plaintext);
		const pt = await decrypt(ct);
		expect(pt).toBe(plaintext);
	});

	it("produces different ciphertexts each time (random IV)", async () => {
		const plaintext = "same plaintext";
		const ct1 = await encrypt(plaintext);
		const ct2 = await encrypt(plaintext);
		expect(ct1).not.toBe(ct2);
		// Both decrypt to the same value
		expect(await decrypt(ct1)).toBe(plaintext);
		expect(await decrypt(ct2)).toBe(plaintext);
	});

	it("rejects tampered ciphertext", async () => {
		const ct = await encrypt("secret");
		const parts = ct.split(":");
		const tamperedTag = (parts[2] ?? "").replace(/^./, (c) =>
			c === "0" ? "1" : "0",
		);
		const tampered = `${parts[0]}:${parts[1]}:${tamperedTag}`;
		await expect(decrypt(tampered)).rejects.toThrow();
	});

	it("rejects malformed ciphertext (wrong part count)", async () => {
		await expect(decrypt("only-one-part")).rejects.toThrow();
		await expect(decrypt("two:parts")).rejects.toThrow();
	});

	it("rejects bad hex in iv", async () => {
		await expect(
			decrypt("zz:not-hex:not-hex"),
		).rejects.toThrow();
	});

	it("honors 32-char raw key (not just 64-char hex)", async () => {
		_resetKeyForTest();
		process.env.ENCRYPTION_KEY = "a".repeat(32); // raw, not hex
		const ct = await encrypt("works");
		expect(await decrypt(ct)).toBe("works");
	});

	it("rejects wrong-length key", async () => {
		_resetKeyForTest();
		process.env.ENCRYPTION_KEY = "tooshort";
		await expect(encrypt("x")).rejects.toThrow(/32 bytes/);
	});
});