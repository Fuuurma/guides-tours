// Tests for the shared dashboard form validation helpers.
//
// Centralizes the same patterns the public booking page uses
// (email regex, length checks, phone digits, positive number)
// so dashboard forms can share validation logic.

import { describe, expect, test } from "vitest";
import {
	EMAIL_REGEX,
	MAX_DESCRIPTION_LEN,
	MAX_EMAIL_LEN,
	MAX_NAME_LEN,
	MAX_NOTES_LEN,
	MAX_PHONE_LEN,
	parseUsdToCents,
	validateDescriptionOptional,
	validateEmail,
	validateName,
	validateNonNegativeNumber,
	validateNotesOptional,
	validatePhoneOptional,
	validatePositiveInteger,
	validatePositiveNumber,
} from "../../src/lib/validation";

describe("validation — EMAIL_REGEX", () => {
	test("accepts common formats", () => {
		expect(EMAIL_REGEX.test("alice@example.com")).toBe(true);
		expect(EMAIL_REGEX.test("bob+tag@example.co.uk")).toBe(true);
		expect(EMAIL_REGEX.test("first.last@subdomain.example.com")).toBe(true);
	});
	test("rejects malformed", () => {
		expect(EMAIL_REGEX.test("a@b")).toBe(false);
		expect(EMAIL_REGEX.test("plainstring")).toBe(false);
		expect(EMAIL_REGEX.test("missing@")).toBe(false);
		expect(EMAIL_REGEX.test("@missinguser.com")).toBe(false);
		expect(EMAIL_REGEX.test("missing@.com")).toBe(false);
	});
});

describe("validateName", () => {
	test("rejects empty / too short", () => {
		expect(validateName("")).toMatch(/at least 2/);
		expect(validateName("a")).toMatch(/at least 2/);
		expect(validateName("   ")).toMatch(/at least 2/);
	});
	test("accepts valid names", () => {
		expect(validateName("Alice")).toBeNull();
		expect(validateName("  Bob  ")).toBeNull(); // trims
	});
	test("rejects names longer than MAX_NAME_LEN", () => {
		expect(validateName("a".repeat(MAX_NAME_LEN + 1))).toMatch(/too long/);
	});
});

describe("validateEmail", () => {
	test("rejects empty", () => {
		expect(validateEmail("")).toMatch(/required/);
		expect(validateEmail("   ")).toMatch(/required/);
	});
	test("rejects malformed", () => {
		expect(validateEmail("a@b")).toMatch(/valid email/);
		expect(validateEmail("notanemail")).toMatch(/valid email/);
	});
	test("accepts valid emails", () => {
		expect(validateEmail("alice@example.com")).toBeNull();
		expect(validateEmail("  bob+tag@example.co.uk  ")).toBeNull();
	});
	test("rejects emails longer than MAX_EMAIL_LEN", () => {
		const longLocal = "a".repeat(MAX_EMAIL_LEN);
		expect(validateEmail(`${longLocal}@x.com`)).toMatch(/too long/);
	});
});

describe("validatePhoneOptional", () => {
	test("accepts empty", () => {
		expect(validatePhoneOptional("")).toBeNull();
		expect(validatePhoneOptional("   ")).toBeNull();
	});
	test("accepts valid phones (6-20 digits)", () => {
		expect(validatePhoneOptional("+1 555 555 5555")).toBeNull();
		expect(validatePhoneOptional("555-123-4567")).toBeNull();
		expect(validatePhoneOptional("+44 20 7946 0958")).toBeNull();
	});
	test("rejects too few / too many digits", () => {
		expect(validatePhoneOptional("12345")).toMatch(/valid phone/);
		expect(validatePhoneOptional("1".repeat(21))).toMatch(/valid phone/);
	});
	test("rejects strings with no digits at all", () => {
		expect(validatePhoneOptional("abcdef")).toMatch(/valid phone/);
	});
});

describe("validateNotesOptional", () => {
	test("accepts empty", () => {
		expect(validateNotesOptional("")).toBeNull();
	});
	test("accepts short notes", () => {
		expect(validateNotesOptional("No allergies")).toBeNull();
	});
	test("rejects notes longer than MAX_NOTES_LEN", () => {
		expect(validateNotesOptional("a".repeat(MAX_NOTES_LEN + 1))).toMatch(
			/too long/,
		);
	});
});

describe("validateDescriptionOptional", () => {
	test("accepts empty", () => {
		expect(validateDescriptionOptional("")).toBeNull();
	});
	test("rejects descriptions longer than MAX_DESCRIPTION_LEN", () => {
		expect(
			validateDescriptionOptional("a".repeat(MAX_DESCRIPTION_LEN + 1)),
		).toMatch(/too long/);
	});
});

describe("validatePositiveInteger", () => {
	test("rejects empty", () => {
		expect(validatePositiveInteger("", "Capacity")).toMatch(/required/);
	});
	test("rejects non-numeric", () => {
		expect(validatePositiveInteger("abc", "Capacity")).toMatch(
			/positive number/,
		);
	});
	test("rejects zero / negative", () => {
		expect(validatePositiveInteger("0", "Capacity")).toMatch(/positive number/);
		expect(validatePositiveInteger("-5", "Capacity")).toMatch(
			/positive number/,
		);
	});
	test("rejects decimals", () => {
		expect(validatePositiveInteger("3.5", "Capacity")).toMatch(/whole number/);
	});
	test("accepts valid integers", () => {
		expect(validatePositiveInteger("1", "Capacity")).toBeNull();
		expect(validatePositiveInteger("100", "Capacity")).toBeNull();
	});
	test("accepts custom label", () => {
		expect(validatePositiveInteger("0", "Guests")).toMatch(/Guests/);
	});
});

describe("validatePositiveNumber", () => {
	test("accepts decimals", () => {
		expect(validatePositiveNumber("1.5", "Hours")).toBeNull();
		expect(validatePositiveNumber("0.5", "Hours")).toBeNull();
	});
	test("rejects zero / negative", () => {
		expect(validatePositiveNumber("0", "Hours")).toMatch(/positive number/);
		expect(validatePositiveNumber("-1", "Hours")).toMatch(/positive number/);
	});
});

describe("validateNonNegativeNumber", () => {
	test("accepts zero", () => {
		expect(validateNonNegativeNumber("0", "Price")).toBeNull();
	});
	test("rejects negative", () => {
		expect(validateNonNegativeNumber("-0.01", "Price")).toMatch(/non-negative/);
	});
});

describe("parseUsdToCents", () => {
	test("returns null for empty input", () => {
		expect(parseUsdToCents("")).toBeNull();
		expect(parseUsdToCents("   ")).toBeNull();
	});
	test("returns null for invalid input", () => {
		expect(parseUsdToCents("abc")).toBeNull();
		expect(parseUsdToCents("-5")).toBeNull();
	});
	test("converts dollars to cents (rounded)", () => {
		expect(parseUsdToCents("1")).toBe(100n);
		expect(parseUsdToCents("1.5")).toBe(150n);
		expect(parseUsdToCents("49.99")).toBe(4999n);
		expect(parseUsdToCents("0.01")).toBe(1n);
	});
	test("rounds floating-point edge cases (documented behavior)", () => {
		// Floating-point math: 1.005 * 100 = 100.49999... → rounds to 100.
		// Math.round uses round-half-to-even semantics but the input is
		// already imprecise by the time we get here. This test pins the
		// current behavior so we notice if it changes.
		expect(parseUsdToCents("1.005")).toBe(100n);
		// Values that ARE exactly representable round cleanly:
		expect(parseUsdToCents("1.5")).toBe(150n);
		expect(parseUsdToCents("2.25")).toBe(225n);
	});
});

// silence unused export warnings for MAX_* constants used as
// documentation constants — they're imported by callers.
void MAX_PHONE_LEN;
