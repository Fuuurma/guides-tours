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
	formatPrice,
} from "../lib/format";

/**
 * How many Intl.NumberFormat objects `run` constructs.
 *
 * A Proxy's construct trap counts the calls and still builds a real
 * NumberFormat, so the code under test behaves exactly as it does in
 * production. The original is restored whatever happens.
 */
function countNumberFormatConstructions(run: () => void): number {
	const original = Intl.NumberFormat;
	let constructed = 0;
	const counting = new Proxy(original, {
		construct(target, args) {
			constructed += 1;
			return Reflect.construct(target, args);
		},
	});
	Intl.NumberFormat = counting as typeof Intl.NumberFormat;
	try {
		run();
	} finally {
		Intl.NumberFormat = original;
	}
	return constructed;
}

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

describe("formatPrice", () => {
	test("formats an amount in the given currency", () => {
		expect(formatPrice(49.99, "EUR")).toBe("€49.99");
		expect(formatPrice(120, "USD")).toBe("$120.00");
	});

	test("falls back to USD for an empty currency", () => {
		expect(formatPrice(120, "")).toBe("$120.00");
	});

	// F754: formatPrice used to construct a fresh Intl.NumberFormat on every
	// call, which is the expensive part of formatting, inside list renders.
	// The formatter is now hoisted per currency, so two calls in the same
	// currency construct one formatter between them.
	//
	// The count is taken with a Proxy's construct trap rather than a spy:
	// `vi.spyOn(Intl, "NumberFormat")` replaces the constructor with a mock
	// that does not build a NumberFormat, so the call under test would fail
	// on `.format` instead of counting.
	test("reuses one formatter per currency instead of constructing per call", () => {
		const count = countNumberFormatConstructions(() => {
			// A currency nothing else in this file formats, so the count is
			// this test's own and not a leftover from an earlier case.
			formatPrice(10, "SEK");
			formatPrice(20, "SEK");
			formatPrice(30, "SEK");
		});
		expect(count).toBe(1);
	});

	test("a different currency gets its own formatter", () => {
		const count = countNumberFormatConstructions(() => {
			formatPrice(10, "NOK");
			formatPrice(20, "DKK");
		});
		expect(count).toBe(2);
	});
});
