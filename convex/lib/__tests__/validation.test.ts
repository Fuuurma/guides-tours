// Unit tests for convex/lib/validation.ts.
//
// These are pure-function tests (no Convex harness needed) —
// validation.ts doesn't touch the DB.

import { describe, expect, it } from "vitest";
import {
	MAX_EMAIL_LEN,
	MAX_NAME_LEN,
	MAX_NOTES_LEN,
	MAX_PHONE_LEN,
	assertValidCustomerInput,
	normalizeEmail,
} from "../validation";

describe("normalizeEmail", () => {
	it("lowercases mixed-case input", () => {
		expect(normalizeEmail("Bob@Example.COM")).toBe("bob@example.com");
	});

	it("trims surrounding whitespace", () => {
		expect(normalizeEmail("  bob@example.com  ")).toBe("bob@example.com");
	});

	it("rejects empty string", () => {
		expect(normalizeEmail("")).toBeNull();
	});

	it("rejects whitespace-only string", () => {
		expect(normalizeEmail("   ")).toBeNull();
	});

	it("rejects strings without @", () => {
		expect(normalizeEmail("bobexample.com")).toBeNull();
	});

	it("rejects strings without a TLD", () => {
		expect(normalizeEmail("bob@example")).toBeNull();
	});

	it("rejects strings with internal whitespace", () => {
		expect(normalizeEmail("bo b@example.com")).toBeNull();
	});

	it("rejects overlong addresses", () => {
		const long = `${"a".repeat(MAX_EMAIL_LEN)}@x.com`;
		expect(normalizeEmail(long)).toBeNull();
	});

	it("accepts an address at exactly the max length", () => {
		const local = "a".repeat(MAX_EMAIL_LEN - "@x.com".length);
		expect(normalizeEmail(`${local}@x.com`)).toBe(`${local}@x.com`);
	});

	it("accepts + addressing", () => {
		expect(normalizeEmail("bob+tag@example.com")).toBe("bob+tag@example.com");
	});

	it("accepts subdomains", () => {
		expect(normalizeEmail("bob@mail.example.co.uk")).toBe(
			"bob@mail.example.co.uk",
		);
	});
});

describe("assertValidCustomerInput", () => {
	it("returns trimmed values for a normal input", () => {
		const out = assertValidCustomerInput({
			name: "  Bob  ",
			notes: "  hello  ",
			phone: "  +1 555 0100  ",
		});
		expect(out).toEqual({ name: "Bob", notes: "  hello  ", phone: "  +1 555 0100  " });
	});

	it("treats undefined notes/phone as empty string", () => {
		const out = assertValidCustomerInput({ name: "Bob" });
		expect(out.notes).toBe("");
		expect(out.phone).toBe("");
	});

	it("throws on empty name", () => {
		expect(() => assertValidCustomerInput({ name: "" })).toThrow(
			/at least 2 characters/,
		);
	});

	it("throws on 1-char name", () => {
		expect(() => assertValidCustomerInput({ name: "a" })).toThrow(
			/at least 2 characters/,
		);
	});

	it("throws on name over the limit", () => {
		expect(() =>
			assertValidCustomerInput({ name: "a".repeat(MAX_NAME_LEN + 1) }),
		).toThrow(/too long/);
	});

	it("accepts name at exactly the limit", () => {
		const out = assertValidCustomerInput({ name: "a".repeat(MAX_NAME_LEN) });
		expect(out.name).toHaveLength(MAX_NAME_LEN);
	});

	it("throws on notes over the limit", () => {
		expect(() =>
			assertValidCustomerInput({
				name: "Bob",
				notes: "n".repeat(MAX_NOTES_LEN + 1),
			}),
		).toThrow(/Notes are too long/);
	});

	it("throws on phone over the limit", () => {
		expect(() =>
			assertValidCustomerInput({
				name: "Bob",
				phone: "5".repeat(MAX_PHONE_LEN + 1),
			}),
		).toThrow(/Phone is too long/);
	});

	it("does not lowercase or strip formatting from phone", () => {
		// Phone formatting (spaces, dashes, parens) is preserved — only
		// length is checked. The dashboard does further digit-count
		// validation; here we only defend against arbitrarily large
		// payloads from the unauth public endpoint.
		const out = assertValidCustomerInput({
			name: "Bob",
			phone: "+1 (555) 010-0100",
		});
		expect(out.phone).toBe("+1 (555) 010-0100");
	});
});