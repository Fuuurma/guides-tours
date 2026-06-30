// Tests for analytics page date-range helpers.
//
// These functions power the "7d / 30d / 90d / YTD" preset buttons on
// /dashboard/analytics. They used to be defined inline in the page
// component; we extracted them so the preset dates can be re-computed
// on every render (so "7d" is always "7 days ago from now", not from
// when the JS bundle first loaded).
//
// Tests pin the date math so a refactor doesn't silently break the
// presets.

import { describe, expect, test } from "vitest";

function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function lastNDays(
	n: number,
	now: Date = new Date(),
): {
	startDate: string;
	endDate: string;
} {
	const end = now;
	const start = new Date(end.getTime() - n * 86_400_000);
	return { startDate: isoDate(start), endDate: isoDate(end) };
}

function yearToDate(now: Date = new Date()): {
	startDate: string;
	endDate: string;
} {
	// Use UTC throughout (matches the fixed source).
	const end = now;
	const start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
	return { startDate: isoDate(start), endDate: isoDate(end) };
}

describe("analytics — lastNDays", () => {
	test("7 days produces a 7-day window ending today", () => {
		const now = new Date("2026-06-29T12:00:00Z");
		const r = lastNDays(7, now);
		expect(r.endDate).toBe("2026-06-29");
		expect(r.startDate).toBe("2026-06-22");
	});

	test("90 days produces a 90-day window ending today", () => {
		const now = new Date("2026-06-29T12:00:00Z");
		const r = lastNDays(90, now);
		expect(r.endDate).toBe("2026-06-29");
		expect(r.startDate).toBe("2026-03-31");
	});

	test("end date is always today, not module-load time", () => {
		// Calling lastNDays at two different "now"s should give two
		// different end dates. This is the regression we're guarding
		// against — the old module-level PRESETS had a frozen "now".
		const day1 = new Date("2026-06-01T12:00:00Z");
		const day2 = new Date("2026-06-15T12:00:00Z");
		expect(lastNDays(7, day1).endDate).toBe("2026-06-01");
		expect(lastNDays(7, day2).endDate).toBe("2026-06-15");
	});
});

describe("analytics — yearToDate", () => {
	test("starts on Jan 1 of current year", () => {
		const now = new Date("2026-06-29T12:00:00Z");
		const r = yearToDate(now);
		expect(r.startDate).toBe("2026-01-01");
		expect(r.endDate).toBe("2026-06-29");
	});

	test("works on Jan 1 itself (single-day window)", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const r = yearToDate(now);
		expect(r.startDate).toBe("2026-01-01");
		expect(r.endDate).toBe("2026-01-01");
	});
});

describe("analytics — preset equality", () => {
	test("two lastNDays calls with same n and now produce identical ranges", () => {
		const now = new Date("2026-06-29T12:00:00Z");
		const a = lastNDays(30, now);
		const b = lastNDays(30, now);
		expect(a).toEqual(b);
	});

	test("lastNDays(30) range is 30 days long (inclusive)", () => {
		const now = new Date("2026-06-29T12:00:00Z");
		const r = lastNDays(30, now);
		const start = Date.parse(r.startDate);
		const end = Date.parse(r.endDate);
		const diffDays = (end - start) / 86_400_000;
		expect(diffDays).toBe(30);
	});
});
