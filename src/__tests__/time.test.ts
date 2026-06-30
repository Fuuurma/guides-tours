// Tests for src/lib/time.ts — frontend HH:MM arithmetic.

import { describe, expect, it } from "vitest";
import { addHours } from "@/lib/time";

describe("addHours", () => {
	it("adds whole hours", () => {
		expect(addHours("09:00", 2)).toBe("11:00");
		expect(addHours("10:00", 1)).toBe("11:00");
	});

	it("adds fractional hours (rounded to nearest minute)", () => {
		expect(addHours("09:00", 1.5)).toBe("10:30");
		expect(addHours("09:00", 2.25)).toBe("11:15");
	});

	it("wraps past midnight", () => {
		expect(addHours("23:00", 2)).toBe("01:00");
		expect(addHours("22:30", 2.5)).toBe("01:00");
	});

	it("pads single-digit hours with a leading zero", () => {
		expect(addHours("05:00", 2)).toBe("07:00");
		expect(addHours("00:30", 1)).toBe("01:30");
	});

	it("returns empty string for malformed input (no NaN:NaN)", () => {
		// These would have produced "NaN:NaN" before the guard. The
		// empty-string contract lets callers gate on it before passing
		// the result to a query (e.g. checkConflicts).
		expect(addHours("", 2)).toBe("");
		expect(addHours("not-a-time", 2)).toBe("");
		expect(addHours("ab:cd", 2)).toBe("");
		expect(addHours("09:00:00", 2)).toBe(""); // too many parts
	});

	it("accepts HH:MM without zero-padded hours (e.g. 9:00)", () => {
		// <input type="time"> always emits zero-padded HH:MM, but we
		// don't enforce zero-padding on parse so callers passing
		// user-typed values (or programmatic shortcuts) still work.
		expect(addHours("9:00", 2)).toBe("11:00");
	});

	it("handles adding 0 hours (identity)", () => {
		expect(addHours("10:00", 0)).toBe("10:00");
	});
});
