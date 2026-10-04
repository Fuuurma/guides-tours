// Tests for the analytics date-range helpers in src/lib/date-range.ts.
//
// Replaces the previous version, which re-implemented lastNDays and
// yearToDate inside this file and tested the copies — the suite could not
// fail when production drifted, and its "now" parameter did not exist on
// the real signatures. These tests call the production functions with the
// system clock faked so the window math is still deterministic.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { lastNDays, upcomingDateRange, yearToDate } from "@/lib/date-range";

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date(2026, 5, 29, 12, 0, 0)); // Jun 29 2026, local
});

afterEach(() => {
	vi.useRealTimers();
});

describe("lastNDays", () => {
	test("7 days produces a 7-day window ending today", () => {
		const r = lastNDays(7);
		expect(r.endDate).toBe("2026-06-29");
		expect(r.startDate).toBe("2026-06-23");
	});

	test("90 days produces a 90-day window ending today", () => {
		const r = lastNDays(90);
		expect(r.endDate).toBe("2026-06-29");
		expect(r.startDate).toBe("2026-04-01");
	});

	test("end date follows the clock, not module-load time", () => {
		// The pre-extraction module-level PRESETS had a frozen "now".
		// Advancing the clock between calls must move the window.
		const first = lastNDays(7);
		vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
		const second = lastNDays(7);
		expect(first.endDate).toBe("2026-06-29");
		expect(second.endDate).toBe("2026-07-15");
	});

	test("lastNDays(30) range is 30 days long (inclusive)", () => {
		const r = lastNDays(30);
		const diffDays =
			(Date.parse(r.endDate) - Date.parse(r.startDate)) / 86_400_000;
		expect(diffDays).toBe(29);
	});
});

describe("yearToDate", () => {
	test("starts on Jan 1 of the current year, ends today", () => {
		const r = yearToDate();
		expect(r.startDate).toBe("2026-01-01");
		expect(r.endDate).toBe("2026-06-29");
	});

	test("works on Jan 1 itself (single-day window)", () => {
		vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 12, 0, 0)));
		const r = yearToDate();
		expect(r.startDate).toBe("2026-01-01");
		expect(r.endDate).toBe("2026-01-01");
	});
});

describe("upcomingDateRange", () => {
	test("starts today and covers n days forward", () => {
		const r = upcomingDateRange(7);
		expect(r.from).toBe("2026-06-29");
		expect(r.to).toBe("2026-07-05");
	});
});
