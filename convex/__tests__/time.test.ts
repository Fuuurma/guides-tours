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
import { parseBookingTime } from "../lib/time";

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