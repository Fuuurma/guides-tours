// Tests for the shared money formatters.
//
// All money values in the system are stored as cents (v.int64() in
// Convex, which returns bigint in the FE). These helpers centralize
// the divide-by-100 + format logic so a refactor doesn't silently
// break money rendering across the dashboard.

import { describe, expect, test } from "vitest";
import { formatCents, formatCentsCompact } from "../lib/format";

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
