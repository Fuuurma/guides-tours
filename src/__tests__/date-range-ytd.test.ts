// F802 — yearToDate() built its window from the UTC clock while every
// other preset in date-range.ts uses the local calendar day, so for
// zone-dependent hours the year-to-date preset named the wrong YEAR:
// Manila at 07:00 on Jan 1 got the entire previous year, New York at
// 19:00 on Dec 31 got one day of the next. The existing preset test
// pins the clock at UTC noon, which lands inside the same local day in
// every zone — it structurally could not see this.
//
// Each case runs under a pinned clock AND a pinned process zone (vitest
// runs this file in its own process, and Node re-reads TZ on change).
// House style: plain chai assertions (no jest-dom matchers in this repo).

import { afterEach, describe, expect, it, vi } from "vitest";
import { lastNDays, yearToDate } from "../lib/date-range";

const originalTz = process.env.TZ;

function underClock(tz: string, instant: string, fn: () => void) {
	process.env.TZ = tz;
	vi.useFakeTimers();
	vi.setSystemTime(new Date(instant));
	try {
		fn();
	} finally {
		vi.useRealTimers();
	}
}

afterEach(() => {
	if (originalTz === undefined) delete process.env.TZ;
	else process.env.TZ = originalTz;
});

describe("yearToDate() uses the local calendar like its siblings (F802)", () => {
	it("Manila, 07:00 on Jan 1 — the new year, not the entire previous one", () => {
		// 2026-01-01T07:00 Asia/Manila is 2025-12-31T23:00Z.
		underClock("Asia/Manila", "2025-12-31T23:00:00Z", () => {
			expect(yearToDate()).toEqual({
				startDate: "2026-01-01",
				endDate: "2026-01-01",
			});
			expect(yearToDate().endDate).toBe(lastNDays(7).endDate);
		});
	});

	it("New York, 19:00 on Dec 31 — the whole year, not one day of the next", () => {
		// 2026-12-31T19:00 America/New_York is 2027-01-01T00:00Z.
		underClock("America/New_York", "2027-01-01T00:00:00Z", () => {
			expect(yearToDate()).toEqual({
				startDate: "2026-01-01",
				endDate: "2026-12-31",
			});
		});
	});

	it("New York, 23:00 on Jun 29 — ends today, not tomorrow", () => {
		// 2026-06-29T23:00 America/New_York is 2026-06-30T03:00Z.
		underClock("America/New_York", "2026-06-30T03:00:00Z", () => {
			expect(yearToDate().endDate).toBe("2026-06-29");
			expect(yearToDate().endDate).toBe(lastNDays(7).endDate);
		});
	});

	it("Madrid, 14:00 on Jun 29 — the control case stays correct", () => {
		underClock("Europe/Madrid", "2026-06-29T12:00:00Z", () => {
			expect(yearToDate()).toEqual({
				startDate: "2026-01-01",
				endDate: "2026-06-29",
			});
		});
	});
});
