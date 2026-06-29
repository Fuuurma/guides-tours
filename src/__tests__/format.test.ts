// Tests for the shared money formatters.
//
// All money values in the system are stored as cents (v.int64() in
// Convex, which returns bigint in the FE). These helpers centralize
// the divide-by-100 + format logic so a refactor doesn't silently
// break money rendering across the dashboard.

import { describe, expect, test } from "vitest";
import {
	centsToInputValue,
	formatCents,
	formatCentsCompact,
	formatCentsWhole,
} from "../lib/format";

describe("formatCents", () => {
	test("formats integer cents with $X.XX", () => {
		expect(formatCents(4999)).toBe("$49.99");
		expect(formatCents(0)).toBe("$0.00");
		expect(formatCents(100)).toBe("$1.00");
	});

	test("formats large values with thousands grouping", () => {
		expect(formatCents(123_456)).toBe("$1,234.56");
		expect(formatCents(1_000_000)).toBe("$10,000.00");
	});

	test("accepts bigint (matches Convex v.int64 return type)", () => {
		expect(formatCents(4999n)).toBe("$49.99");
		expect(formatCents(123_456n)).toBe("$1,234.56");
	});

	test("returns $0.00 for null or undefined", () => {
		expect(formatCents(null)).toBe("$0.00");
		expect(formatCents(undefined)).toBe("$0.00");
	});
});

describe("formatCentsCompact", () => {
	test("formats without grouping", () => {
		expect(formatCentsCompact(4999)).toBe("$49.99");
		expect(formatCentsCompact(100)).toBe("$1.00");
	});

	test("accepts bigint", () => {
		expect(formatCentsCompact(4999n)).toBe("$49.99");
	});

	test("returns $0.00 for null or undefined", () => {
		expect(formatCentsCompact(null)).toBe("$0.00");
		expect(formatCentsCompact(undefined)).toBe("$0.00");
	});
});

describe("formatCentsWhole", () => {
	test("formats without decimals or grouping", () => {
		expect(formatCentsWhole(375000)).toBe("$3750");
		expect(formatCentsWhole(0)).toBe("$0");
		expect(formatCentsWhole(100)).toBe("$1");
	});

	test("rounds fractional cents", () => {
		expect(formatCentsWhole(150)).toBe("$2");
	});

	test("accepts bigint", () => {
		expect(formatCentsWhole(375000n)).toBe("$3750");
	});

	test("returns $0 for null or undefined", () => {
		expect(formatCentsWhole(null)).toBe("$0");
		expect(formatCentsWhole(undefined)).toBe("$0");
	});
});

describe("centsToInputValue", () => {
	test("converts cents to decimal string", () => {
		expect(centsToInputValue(4999)).toBe("49.99");
		expect(centsToInputValue(0)).toBe("0.00");
		expect(centsToInputValue(100)).toBe("1.00");
	});

	test("accepts bigint", () => {
		expect(centsToInputValue(4999n)).toBe("49.99");
	});

	test("returns empty string for null or undefined", () => {
		expect(centsToInputValue(null)).toBe("");
		expect(centsToInputValue(undefined)).toBe("");
	});
});
