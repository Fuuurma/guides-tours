import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import {
	addDaysYmd,
	computeStaffingGaps,
	formatStaffingDigest,
	utcYmd,
} from "../staffingGaps";

describe("utcYmd / addDaysYmd", () => {
	it("adds days across month boundaries", () => {
		expect(addDaysYmd("2026-01-31", 1)).toBe("2026-02-01");
		expect(addDaysYmd("2026-07-19", 0)).toBe("2026-07-19");
	});

	it("formats a fixed UTC date", () => {
		expect(utcYmd(new Date(Date.UTC(2026, 6, 19)))).toBe("2026-07-19");
	});
});

describe("computeStaffingGaps", () => {
	const tourId = "tour_walk" as Id<"tours">;
	const carTourId = "tour_car" as Id<"tours">;

	it("flags schedules with no guides", () => {
		const gaps = computeStaffingGaps({
			schedules: [
				{
					_id: "sch1" as Id<"tourSchedules">,
					tourId,
					date: "2026-08-01",
					startTime: "09:00",
					endTime: "11:00",
					status: "available",
					capacityBooked: 2,
				},
			],
			assignments: [],
			toursById: new Map([
				[
					String(tourId),
					{
						_id: tourId,
						name: "Walk",
						tourType: "walking",
						requiredGuides: 1,
					},
				],
			]),
		});
		expect(gaps).toHaveLength(1);
		expect(gaps[0]?.gaps).toEqual(["guides"]);
	});

	it("flags car tours missing vehicle and driver", () => {
		const gaps = computeStaffingGaps({
			schedules: [
				{
					_id: "sch2" as Id<"tourSchedules">,
					tourId: carTourId,
					date: "2026-08-02",
					startTime: "10:00",
					endTime: "12:00",
					status: "available",
					capacityBooked: 0,
				},
			],
			assignments: [
				{
					_id: "a1" as Id<"assignments">,
					tourId: carTourId,
					date: "2026-08-02",
					startTime: "10:00",
					status: "scheduled",
					guideId: "g1",
				},
			],
			toursById: new Map([
				[
					String(carTourId),
					{
						_id: carTourId,
						name: "City Car",
						tourType: "car",
						requiredGuides: 1,
					},
				],
			]),
		});
		expect(gaps).toHaveLength(1);
		expect(gaps[0]?.gaps).toEqual(["vehicle", "driver"]);
	});

	it("returns empty when fully staffed", () => {
		const gaps = computeStaffingGaps({
			schedules: [
				{
					_id: "sch3" as Id<"tourSchedules">,
					tourId,
					date: "2026-08-03",
					startTime: "09:00",
					endTime: "11:00",
					status: "available",
					capacityBooked: 1,
				},
			],
			assignments: [
				{
					_id: "a2" as Id<"assignments">,
					tourId,
					date: "2026-08-03",
					startTime: "09:00",
					status: "scheduled",
					guideId: "g1",
				},
			],
			toursById: new Map([
				[
					String(tourId),
					{
						_id: tourId,
						name: "Walk",
						tourType: "walking",
						requiredGuides: 1,
					},
				],
			]),
		});
		expect(gaps).toHaveLength(0);
	});
});

describe("formatStaffingDigest", () => {
	it("reports OK when no gaps", () => {
		const msg = formatStaffingDigest({
			dateFrom: "2026-08-01",
			dateTo: "2026-08-03",
			gaps: [],
		});
		expect(msg.subject).toContain("Staffing OK");
		expect(msg.bodyText).toContain("fully staffed");
	});

	it("lists missing phones in the digest body", () => {
		const msg = formatStaffingDigest({
			dateFrom: "2026-08-01",
			dateTo: "2026-08-03",
			gaps: [],
			siteUrl: "https://app.example.com",
			missingPhones: [
				{ name: "Alex", roles: ["guide"], assignmentCount: 2 },
				{ name: "Sam", roles: ["driver"], assignmentCount: 1 },
			],
		});
		expect(msg.bodyText).toContain("missing phone");
		expect(msg.bodyText).toContain("Alex");
		expect(msg.bodyText).toContain("Sam");
		expect(msg.bodyText).toContain("/dashboard/staffing?");
	});

	it("includes deep links when siteUrl is set", () => {
		const msg = formatStaffingDigest({
			dateFrom: "2026-08-01",
			dateTo: "2026-08-03",
			siteUrl: "https://app.example.com",
			gaps: [
				{
					key: "k",
					tourId: "t" as Id<"tours">,
					tourName: "Walk",
					date: "2026-08-01",
					startTime: "09:00",
					scheduleId: "sch1" as Id<"tourSchedules">,
					capacityBooked: 0,
					guideCount: 0,
					requiredGuides: 1,
					guidesNeeded: 1,
					requiresVehicle: false,
					requiresDriver: false,
					hasVehicle: false,
					hasDriver: false,
					gaps: ["guides"],
					assignmentIds: [],
				},
			],
		});
		expect(msg.bodyText).toContain(
			"https://app.example.com/dashboard/staffing?from=2026-08-01&to=2026-08-03",
		);
		expect(msg.bodyText).toContain(
			"https://app.example.com/dashboard/assignments/new?date=2026-08-01&scheduleId=sch1",
		);
		expect(msg.smsBody).toContain("/dashboard/staffing?");
	});

	it("summarizes gaps for SMS", () => {
		const msg = formatStaffingDigest({
			dateFrom: "2026-08-01",
			dateTo: "2026-08-03",
			gaps: [
				{
					key: "k",
					tourId: "t" as Id<"tours">,
					tourName: "Walk",
					date: "2026-08-01",
					startTime: "09:00",
					capacityBooked: 0,
					guideCount: 0,
					requiredGuides: 1,
					guidesNeeded: 1,
					requiresVehicle: false,
					requiresDriver: false,
					hasVehicle: false,
					hasDriver: false,
					gaps: ["guides"],
					assignmentIds: [],
				},
			],
		});
		expect(msg.subject).toContain("1 staffing gap");
		expect(msg.smsBody).toContain("Walk");
	});
});
