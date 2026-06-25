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
		it("round-trips a simple string with a hex key", () => {
			const ct = encrypt("viator-api-key-12345");
			expect(ct).not.toBe("viator-api-key-12345");
			expect(ct.split(":")).toHaveLength(3);
			expect(decrypt(ct)).toBe("viator-api-key-12345");
		});

		it("round-trips with a 32-byte ascii key", () => {
			_resetKeyForTest();
			process.env.ENCRYPTION_KEY = ASCII_KEY;
			const ct = encrypt("secret-stripe-key");
			expect(decrypt(ct)).toBe("secret-stripe-key");
		});

		it("round-trips an empty string", () => {
			const ct = encrypt("");
			expect(decrypt(ct)).toBe("");
		});

		it("round-trips unicode", () => {
			const original = "Guía de tours — 中文 🌴";
			expect(decrypt(encrypt(original))).toBe(original);
		});

		it("round-trips a long string", () => {
			const original = "x".repeat(10_000);
			expect(decrypt(encrypt(original))).toBe(original);
		});

		it("produces different ciphertext each call (random IV)", () => {
			const ct1 = encrypt("same plaintext");
			const ct2 = encrypt("same plaintext");
			expect(ct1).not.toBe(ct2);
			expect(decrypt(ct1)).toBe("same plaintext");
			expect(decrypt(ct2)).toBe("same plaintext");
		});
	});

	describe("authentication (GCM tag)", () => {
		it("rejects tampered ciphertext", () => {
			const ct = encrypt("pay-me");
			const [iv, body, tag] = ct.split(":") as [string, string, string];
			// Flip one hex char in the ciphertext body.
			const tampered =
				body.slice(0, -1) + (body.slice(-1) === "a" ? "b" : "a");
			expect(() => decrypt(`${iv}:${tampered}:${tag}`)).toThrow();
		});

		it("rejects tampered auth tag", () => {
			const ct = encrypt("pay-me");
			const [iv, body, tag] = ct.split(":") as [string, string, string];
			const tamperedTag =
				tag.slice(0, -1) + (tag.slice(-1) === "a" ? "b" : "a");
			expect(() => decrypt(`${iv}:${body}:${tamperedTag}`)).toThrow();
		});
	});

	describe("input validation", () => {
		it("throws when ENCRYPTION_KEY is missing", () => {
			_resetKeyForTest();
			delete process.env.ENCRYPTION_KEY;
			expect(() => encrypt("x")).toThrow(/ENCRYPTION_KEY/);
		});

		it("throws on wrong-length key", () => {
			_resetKeyForTest();
			process.env.ENCRYPTION_KEY = "tooshort";
			expect(() => encrypt("x")).toThrow(/32 bytes/);
		});

		it("throws on malformed ciphertext", () => {
			expect(() => decrypt("not-a-valid-format")).toThrow(/format/);
		});
	});

	describe("key rotation", () => {
		it("data encrypted under key A cannot be decrypted under key B", () => {
			const ct = encrypt("secret");
			_resetKeyForTest();
			process.env.ENCRYPTION_KEY = "b".repeat(64);
			expect(() => decrypt(ct)).toThrow();
		});

		it("after rotation, new data uses new key", () => {
			const oldCt = encrypt("old-secret");
			_resetKeyForTest();
			process.env.ENCRYPTION_KEY = "b".repeat(64);
			const newCt = encrypt("new-secret");
			expect(decrypt(newCt)).toBe("new-secret");
			expect(() => decrypt(oldCt)).toThrow();
		});
	});
});
