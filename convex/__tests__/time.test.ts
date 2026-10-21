// Tests for the shared date/time parser used by public_booking,
// scheduledNotifications, and the bookings.create flow.
//
// Coverage:
//   - Accepts valid YYYY-MM-DD + HH:MM
//   - Accepts HH:MM:SS
//   - Rejects malformed shapes (no match)
//   - Rejects out-of-range months / days / hours / minutes
//   - Rejects Feb 29 in non-leap years (Feb 31 → Mar 3 silently rolls over)
//   - Rejects Apr 31 (only 30 days)
//   - Verifies round-trip (the parsed timestamp decodes back to the same date)

import { describe, expect, test } from "vitest";
import {
	parseBookingTime,
	parseBookingTimeInZone,
	parseYmd,
} from "../lib/time";

describe("parseBookingTime", () => {
	test("accepts a valid date and HH:MM", () => {
		const ts = parseBookingTime("2026-07-15", "14:30");
		expect(ts).not.toBeNull();
		const d = new Date(ts!);
		expect(d.getUTCFullYear()).toBe(2026);
		expect(d.getUTCMonth()).toBe(6); // 0-indexed
		expect(d.getUTCDate()).toBe(15);
		expect(d.getUTCHours()).toBe(14);
		expect(d.getUTCMinutes()).toBe(30);
		expect(d.getUTCSeconds()).toBe(0);
	});

	test("accepts HH:MM:SS with seconds", () => {
		const ts = parseBookingTime("2026-07-15", "14:30:45");
		expect(ts).not.toBeNull();
		expect(new Date(ts!).getUTCSeconds()).toBe(45);
	});

	test("rejects malformed date", () => {
		expect(parseBookingTime("2026/07/15", "14:30")).toBeNull();
		expect(parseBookingTime("26-07-15", "14:30")).toBeNull();
		expect(parseBookingTime("", "14:30")).toBeNull();
	});

	test("rejects malformed time", () => {
		expect(parseBookingTime("2026-07-15", "14:30:")).toBeNull();
		expect(parseBookingTime("2026-07-15", "1430")).toBeNull();
		expect(parseBookingTime("2026-07-15", "")).toBeNull();
	});

	test("rejects month > 12", () => {
		expect(parseBookingTime("2026-13-15", "14:30")).toBeNull();
		expect(parseBookingTime("2026-00-15", "14:30")).toBeNull();
	});

	test("rejects day > 31", () => {
		expect(parseBookingTime("2026-07-32", "14:30")).toBeNull();
		expect(parseBookingTime("2026-07-00", "14:30")).toBeNull();
	});

	test("rejects hours > 23", () => {
		expect(parseBookingTime("2026-07-15", "24:00")).toBeNull();
		expect(parseBookingTime("2026-07-15", "25:00")).toBeNull();
	});

	test("rejects minutes >= 60", () => {
		expect(parseBookingTime("2026-07-15", "14:60")).toBeNull();
	});

	test("rejects Feb 31 (silently rolls to Mar 3 without guard)", () => {
		// Without the round-trip check, Date.UTC(2026, 1, 31) returns
		// March 3 — bookings would land on the wrong day.
		expect(parseBookingTime("2026-02-31", "14:30")).toBeNull();
	});

	test("rejects Apr 31 (only 30 days)", () => {
		expect(parseBookingTime("2026-04-31", "14:30")).toBeNull();
	});

	test("rejects Feb 29 in non-leap year", () => {
		expect(parseBookingTime("2026-02-29", "14:30")).toBeNull();
	});

	test("accepts Feb 29 in leap year", () => {
		const ts = parseBookingTime("2024-02-29", "14:30");
		expect(ts).not.toBeNull();
		const d = new Date(ts!);
		expect(d.getUTCFullYear()).toBe(2024);
		expect(d.getUTCMonth()).toBe(1);
		expect(d.getUTCDate()).toBe(29);
	});

	test("accepts Dec 31", () => {
		const ts = parseBookingTime("2026-12-31", "23:59");
		expect(ts).not.toBeNull();
		const d = new Date(ts!);
		expect(d.getUTCMonth()).toBe(11);
		expect(d.getUTCDate()).toBe(31);
	});

	test("accepts Jan 1", () => {
		const ts = parseBookingTime("2026-01-01", "00:00");
		expect(ts).not.toBeNull();
		const d = new Date(ts!);
		expect(d.getUTCMonth()).toBe(0);
		expect(d.getUTCDate()).toBe(1);
		expect(d.getUTCHours()).toBe(0);
	});
});

// F710: parseYmd is the shared bare-date half — dateRange and
// vacationRequests' bounds validate through it. Unpadded input like
// "2026-1-1" must NOT pass: lexicographic ordering on unpadded strings
// is wrong ("2026-12-31" <= "2026-3-1"), which is exactly the window
// inflation the caller used to ship.
describe("parseYmd", () => {
	test("accepts a padded YYYY-MM-DD and returns UTC midnight", () => {
		const ts = parseYmd("2026-07-15");
		expect(ts).not.toBeNull();
		const d = new Date(ts!);
		expect(d.getUTCFullYear()).toBe(2026);
		expect(d.getUTCMonth()).toBe(6);
		expect(d.getUTCDate()).toBe(15);
		expect(d.getUTCHours()).toBe(0);
		expect(d.getUTCMinutes()).toBe(0);
	});

	test("rejects unpadded month and day", () => {
		expect(parseYmd("2026-1-1")).toBeNull();
		expect(parseYmd("2026-01-1")).toBeNull();
		expect(parseYmd("2026-1-15")).toBeNull();
	});

	test("rejects non-date strings", () => {
		expect(parseYmd("")).toBeNull();
		expect(parseYmd("garbage")).toBeNull();
		expect(parseYmd("2026/07/15")).toBeNull();
		expect(parseYmd("2026-07-15T00:00:00Z")).toBeNull();
	});

	test("rejects rollover dates (Feb 31, Apr 31, Feb 29 non-leap)", () => {
		expect(parseYmd("2026-02-31")).toBeNull();
		expect(parseYmd("2026-04-31")).toBeNull();
		expect(parseYmd("2026-02-29")).toBeNull();
		expect(parseYmd("2028-02-29")).not.toBeNull();
	});
});
describe("parseBookingTimeInZone — operator-zone parsing", () => {
	const MADRID = "Europe/Madrid";

	test("resolves wall time in the zone, not UTC", () => {
		// July: Madrid is CEST (UTC+2) — 14:30 local is 12:30 UTC.
		expect(parseBookingTimeInZone("2026-07-15", "14:30", MADRID)).toBe(
			Date.UTC(2026, 6, 15, 12, 30),
		);
		// January: Madrid is CET (UTC+1) — 14:30 local is 13:30 UTC.
		expect(parseBookingTimeInZone("2026-01-15", "14:30", MADRID)).toBe(
			Date.UTC(2026, 0, 15, 13, 30),
		);
	});

	test("DST spring forward (2026-03-29): post-transition reads CEST", () => {
		// Clocks jump 02:00→03:00 on 2026-03-29; 10:00 local is CEST (+2).
		expect(parseBookingTimeInZone("2026-03-29", "10:00", MADRID)).toBe(
			Date.UTC(2026, 2, 29, 8, 0),
		);
		// The day before the jump is still CET (+1).
		expect(parseBookingTimeInZone("2026-03-28", "10:00", MADRID)).toBe(
			Date.UTC(2026, 2, 28, 9, 0),
		);
	});

	test("DST gap (2026-03-29 02:30): nonexistent wall time shifts forward", () => {
		// 02:30 never happens — Temporal "compatible" pushes by the 1h gap
		// to 03:30 CEST = 01:30 UTC.
		expect(parseBookingTimeInZone("2026-03-29", "02:30", MADRID)).toBe(
			Date.UTC(2026, 2, 29, 1, 30),
		);
	});

	test("DST autumn fold (2026-10-25): reads CET after fallback", () => {
		// Clocks fall back 03:00→02:00 on 2026-10-25; 10:00 local is CET (+1).
		expect(parseBookingTimeInZone("2026-10-25", "10:00", MADRID)).toBe(
			Date.UTC(2026, 9, 25, 9, 0),
		);
		// Ambiguous 02:30 takes the first occurrence — CEST (+2) = 00:30 UTC.
		expect(parseBookingTimeInZone("2026-10-25", "02:30", MADRID)).toBe(
			Date.UTC(2026, 9, 25, 0, 30),
		);
	});

	test("explicit UTC matches the legacy parser", () => {
		expect(parseBookingTimeInZone("2026-07-15", "14:30", "UTC")).toBe(
			parseBookingTime("2026-07-15", "14:30"),
		);
	});

	test("malformed input still returns null", () => {
		expect(parseBookingTimeInZone("2026-02-31", "10:00", MADRID)).toBeNull();
		expect(parseBookingTimeInZone("2026-07-15", "25:00", MADRID)).toBeNull();
		expect(parseBookingTimeInZone("garbage", "10:00", MADRID)).toBeNull();
	});

	test("unknown zone id falls back to UTC semantics", () => {
		expect(
			parseBookingTimeInZone("2026-07-15", "14:30", "Not/AZone"),
		).toBe(parseBookingTime("2026-07-15", "14:30"));
	});
});

