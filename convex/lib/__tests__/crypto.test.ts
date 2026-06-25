import { describe, expect, it, beforeEach } from "vitest";
import { encrypt, decrypt, _resetKeyForTest } from "../crypto";

const HEX_KEY = "a".repeat(64);
const ASCII_KEY = "a".repeat(32);

describe("convex/lib/crypto", () => {
	beforeEach(() => {
		_resetKeyForTest();
		process.env.ENCRYPTION_KEY = HEX_KEY;
	});

	describe("encrypt + decrypt", () => {
		it("round-trips a simple string with a hex key", async () => {
			const ct = await encrypt("viator-api-key-12345");
			expect(ct).not.toBe("viator-api-key-12345");
			expect(ct.split(":")).toHaveLength(3);
			expect(await decrypt(ct)).toBe("viator-api-key-12345");
		});

		it("round-trips with a 32-byte ascii key", async () => {
			_resetKeyForTest();
			process.env.ENCRYPTION_KEY = ASCII_KEY;
			const ct = await encrypt("secret-stripe-key");
			expect(await decrypt(ct)).toBe("secret-stripe-key");
		});

		it("round-trips an empty string", async () => {
			const ct = await encrypt("");
			expect(await decrypt(ct)).toBe("");
		});

		it("round-trips unicode", async () => {
			const original = "Guía de tours — 中文 🌴";
			expect(await decrypt(await encrypt(original))).toBe(original);
		});

		it("round-trips a long string", async () => {
			const original = "x".repeat(10_000);
			expect(await decrypt(await encrypt(original))).toBe(original);
		});

		it("produces different ciphertext each call (random IV)", async () => {
			const ct1 = await encrypt("same plaintext");
			const ct2 = await encrypt("same plaintext");
			expect(ct1).not.toBe(ct2);
			expect(await decrypt(ct1)).toBe("same plaintext");
			expect(await decrypt(ct2)).toBe("same plaintext");
		});
	});

	describe("authentication (GCM tag)", () => {
		it("rejects tampered ciphertext", async () => {
			const ct = await encrypt("pay-me");
			const [iv, body, tag] = ct.split(":") as [string, string, string];
			const tampered =
				body.slice(0, -1) + (body.slice(-1) === "a" ? "b" : "a");
			await expect(decrypt(`${iv}:${tampered}:${tag}`)).rejects.toThrow();
		});

		it("rejects tampered auth tag", async () => {
			const ct = await encrypt("pay-me");
			const [iv, body, tag] = ct.split(":") as [string, string, string];
			const tamperedTag =
				tag.slice(0, -1) + (tag.slice(-1) === "a" ? "b" : "a");
			await expect(decrypt(`${iv}:${body}:${tamperedTag}`)).rejects.toThrow();
		});
	});

	describe("input validation", () => {
		it("throws when ENCRYPTION_KEY is missing", async () => {
			_resetKeyForTest();
			delete process.env.ENCRYPTION_KEY;
			await expect(encrypt("x")).rejects.toThrow(/ENCRYPTION_KEY/);
		});

		it("throws on wrong-length key", async () => {
			_resetKeyForTest();
			process.env.ENCRYPTION_KEY = "tooshort";
			await expect(encrypt("x")).rejects.toThrow(/32 bytes/);
		});

		it("throws on malformed ciphertext", async () => {
			await expect(decrypt("not-a-valid-format")).rejects.toThrow(/format/);
		});
	});

	describe("key rotation", () => {
		it("data encrypted under key A cannot be decrypted under key B", async () => {
			const ct = await encrypt("secret");
			_resetKeyForTest();
			process.env.ENCRYPTION_KEY = "b".repeat(64);
			await expect(decrypt(ct)).rejects.toThrow();
		});

		it("after rotation, new data uses new key", async () => {
			const oldCt = await encrypt("old-secret");
			_resetKeyForTest();
			process.env.ENCRYPTION_KEY = "b".repeat(64);
			const newCt = await encrypt("new-secret");
			expect(await decrypt(newCt)).toBe("new-secret");
			await expect(decrypt(oldCt)).rejects.toThrow();
		});
	});
});
