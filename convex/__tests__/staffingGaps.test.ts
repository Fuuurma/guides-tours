// Unit tests for convex/lib/staffingGaps — the ops staffing-digest
// core (F19 coverage gap: zero direct tests). Pure functions, no
// convex-test harness needed.
//
// Pins: cancelled/deleted filtering on both sides, ready slots
// producing no rows, guide/vehicle/driver gap enumeration, orphan
// assignments (no schedule) surfacing with capacityBooked 0, date+
// startTime sort, the ymd helpers' UTC rollover, and the digest
// formatter's OK / gaps / truncation / missing-phone variants.

import { describe, expect, it } from "vitest";
import type { GapAssignment, GapSchedule, GapTour } from "../lib/staffingGaps";
import {
	addDaysYmd,
	computeStaffingGaps,
	formatStaffingDigest,
	utcYmd,
} from "../lib/staffingGaps";

function tour(overrides: Partial<GapTour> = {}): GapTour {
	return {
		_id: "tours_t1" as GapTour["_id"],
		name: "Old Town Walk",
		tourType: "walking",
		requiredGuides: 1,
		...overrides,
	};
}

function schedule(overrides: Partial<GapSchedule> = {}): GapSchedule {
	return {
		_id: "tourSchedules_s1" as GapSchedule["_id"],
		tourId: "tours_t1" as GapSchedule["tourId"],
		date: "2026-12-20",
		startTime: "09:00",
		endTime: "11:00",
		status: "available",
		capacityBooked: 6,
		...overrides,
	};
}

function assignment(overrides: Partial<GapAssignment> = {}): GapAssignment {
	return {
		_id: "assignments_a1" as GapAssignment["_id"],
		tourId: "tours_t1" as GapAssignment["tourId"],
		date: "2026-12-20",
		startTime: "09:00",
		status: "scheduled",
		guideId: "guide_1",
		...overrides,
	};
}

const toursById = new Map([["tours_t1", tour()]]);

describe("staffingGaps.computeStaffingGaps", () => {
	it("a fully staffed slot produces no rows", () => {
		const rows = computeStaffingGaps({
			schedules: [schedule()],
			assignments: [assignment()],
			toursById,
		});
		expect(rows).toEqual([]);
	});

	it("an unstaffed schedule surfaces a guides gap", () => {
		const rows = computeStaffingGaps({
			schedules: [schedule()],
			assignments: [],
			toursById,
		});
		expect(rows.length).toBe(1);
		const row = rows[0]!;
		expect(row.gaps).toEqual(["guides"]);
		expect(row.guidesNeeded).toBe(1);
		expect(row.guideCount).toBe(0);
		expect(row.requiredGuides).toBe(1);
		expect(row.capacityBooked).toBe(6);
		expect(row.scheduleId).toBe("tourSchedules_s1");
	});

	it("cancelled and soft-deleted assignments do not staff a slot", () => {
		const rows = computeStaffingGaps({
			schedules: [schedule()],
			assignments: [
				assignment({ status: "cancelled" }),
				assignment({ _id: "assignments_a2" as never, deletedAt: 123 }),
			],
			toursById,
		});
		expect(rows.length).toBe(1);
		expect(rows[0]!.guideCount).toBe(0);
	});

	it("cancelled schedules are skipped entirely", () => {
		const rows = computeStaffingGaps({
			schedules: [schedule({ status: "cancelled" })],
			assignments: [],
			toursById,
		});
		expect(rows).toEqual([]);
	});

	it("vehicle and driver requirements enumerate separately", () => {
		const rows = computeStaffingGaps({
			schedules: [schedule()],
			assignments: [assignment()],
			toursById: new Map([
				[
					"tours_t1",
					tour({ requiresVehicle: true, requiresDriver: true }),
				],
			]),
		});
		expect(rows.length).toBe(1);
		expect(rows[0]!.gaps).toEqual(["vehicle", "driver"]);
		expect(rows[0]!.guidesNeeded).toBe(0);
	});

	it("orphan assignments with no schedule surface with capacityBooked 0", () => {
		const rows = computeStaffingGaps({
			schedules: [],
			assignments: [
				assignment({ date: "2026-12-21", startTime: "10:00" }),
			],
			toursById: new Map([["tours_t1", tour({ requiredGuides: 2 })]]),
		});
		expect(rows.length).toBe(1);
		expect(rows[0]!.date).toBe("2026-12-21");
		expect(rows[0]!.capacityBooked).toBe(0);
		expect(rows[0]!.guidesNeeded).toBe(1);
		expect(rows[0]!.endTime).toBeUndefined();
	});

	it("rows sort by date then startTime", () => {
		const rows = computeStaffingGaps({
			schedules: [
				schedule({ date: "2026-12-21", startTime: "14:00" }),
				schedule({
					_id: "tourSchedules_s2" as never,
					date: "2026-12-20",
					startTime: "17:00",
				}),
				schedule({
					_id: "tourSchedules_s3" as never,
					date: "2026-12-20",
					startTime: "09:00",
				}),
			],
			assignments: [],
			toursById,
		});
		expect(rows.map((r) => `${r.date} ${r.startTime}`)).toEqual([
			"2026-12-20 09:00",
			"2026-12-20 17:00",
			"2026-12-21 14:00",
		]);
	});
});

describe("staffingGaps date helpers", () => {
	it("utcYmd renders UTC calendar day", () => {
		expect(utcYmd(new Date(Date.UTC(2026, 8, 22)))).toBe("2026-09-22");
	});

	it("addDaysYmd rolls over month and year boundaries", () => {
		expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
		expect(addDaysYmd("2026-09-30", 1)).toBe("2026-10-01");
		expect(addDaysYmd("2026-10-01", -1)).toBe("2026-09-30");
	});
});

describe("staffingGaps.formatStaffingDigest", () => {
	const gap = computeStaffingGaps({
		schedules: [schedule()],
		assignments: [],
		toursById,
	})[0]!;

	it("zero gaps renders the all-staffed variant", () => {
		const out = formatStaffingDigest({
			dateFrom: "2026-12-20",
			dateTo: "2026-12-21",
			gaps: [],
		});
		expect(out.subject).toBe("Staffing OK · 2026-12-20–2026-12-21");
		expect(out.bodyText).toContain("fully staffed");
	});

	it("gaps render bullet lines with needs + guide counts", () => {
		const out = formatStaffingDigest({
			dateFrom: "2026-12-20",
			dateTo: "2026-12-20",
			gaps: [gap],
		});
		expect(out.subject).toBe("1 staffing gap · 2026-12-20–2026-12-20");
		expect(out.bodyText).toContain(
			"• 2026-12-20 09:00 Old Town Walk — needs guides (guides 0/1)",
		);
		expect(out.smsBody).toContain("1 staffing gap");
	});

	it("truncates past maxLines and links the staffing page", () => {
		const many = Array.from({ length: 14 }, (_, i) => ({
			...gap,
			key: `k${i}`,
		}));
		const out = formatStaffingDigest({
			dateFrom: "2026-12-20",
			dateTo: "2026-12-21",
			gaps: many,
			maxLines: 3,
			siteUrl: "https://app.example.com/",
		});
		expect(out.bodyText).toContain("…and 11 more.");
		expect(out.bodyText).toContain(
			"See all: https://app.example.com/dashboard/staffing?from=2026-12-20&to=2026-12-21",
		);
	});

	it("lists staff missing phones", () => {
		const out = formatStaffingDigest({
			dateFrom: "2026-12-20",
			dateTo: "2026-12-20",
			gaps: [gap],
			missingPhones: [
				{ name: "Blas", roles: ["guide"], assignmentCount: 2 },
			],
		});
		expect(out.bodyText).toContain(
			"1 assigned staff missing phone (no SMS):",
		);
		expect(out.bodyText).toContain("• Blas (guide, 2 assignments)");
	});

	// F872 — a cut scan must never read as a fully-staffed window. The
	// zero-gap variant is the dangerous one: before the flag, a window
	// with 500+ rows and no visible gaps mailed "All departures look
	// fully staffed" (or was skipped as nothing-to-report).
	it("a truncated zero-gap window is reported as an incomplete check, not as fully staffed", () => {
		const out = formatStaffingDigest({
			dateFrom: "2026-12-20",
			dateTo: "2026-12-21",
			gaps: [],
			truncated: true,
			siteUrl: "https://app.example.com",
		});
		expect(out.subject).toBe("Staffing check incomplete · 2026-12-20–2026-12-21");
		expect(out.bodyText).not.toContain("fully staffed");
		expect(out.bodyText).toContain("the check was cut short");
		expect(out.bodyText).toContain(
			"Review in Staffing: https://app.example.com/dashboard/staffing?from=2026-12-20&to=2026-12-21",
		);
		expect(out.smsBody).toContain("cut short");
	});

	it("a truncated gap list marks the count as a floor on every channel", () => {
		const out = formatStaffingDigest({
			dateFrom: "2026-12-20",
			dateTo: "2026-12-20",
			gaps: [gap],
			truncated: true,
		});
		expect(out.subject).toBe("1+ staffing gaps (partial check) · 2026-12-20–2026-12-20");
		expect(out.bodyText).toContain("Partial check: the row cap was hit");
		expect(out.smsBody).toContain("Partial check.");
	});

	it("an untruncated digest carries no partial-check copy", () => {
		const out = formatStaffingDigest({
			dateFrom: "2026-12-20",
			dateTo: "2026-12-20",
			gaps: [gap],
			truncated: false,
		});
		expect(out.subject).toBe("1 staffing gap · 2026-12-20–2026-12-20");
		expect(out.bodyText).not.toContain("Partial check");
		expect(out.smsBody).not.toContain("Partial check");
	});
});
