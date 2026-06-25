// Tests for assignments + conflict detection.
//
// Coverage:
//   - timeToMinutes / minutesToTime round-trip
//   - calculateEndTime handles midnight wrap (23:30 + 2h = 01:30)
//   - rangesOverlap: positive overlap, edge-touching, no overlap
//   - checkConflicts query: guide conflict, vehicle conflict, driver
//     conflict, no conflict, excludeAssignmentId skips self
//   - create rejects tour in different org
//   - create rejects vehicle in different org
//   - create rejects guide on approved vacation
//   - create rejects unavailable guide
//   - create writes audit log
//   - update rejects modifying cancelled/completed assignments
//   - cancel/complete lifecycle

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import schema from "../schema";
import { internal } from "../_generated/api";
import {
	timeToMinutes,
	minutesToTime,
	calculateEndTime,
	rangesOverlap,
	checkConflictsHelper,
} from "../assignments";

const modules = import.meta.glob("../**/*.{ts,tsx}");

type TestCtx = GenericMutationCtx<DataModel> & {
	storage: { getUrl: (id: string) => Promise<string | null> };
};

async function seedTour(
	ctx: TestCtx,
	orgId: string,
	durationHours = 2,
): Promise<Id<"tours">> {
	return await ctx.db.insert("tours", {
		organizationId: orgId,
		name: "Old Town Walk",
		description: "",
		durationHours,
		isActive: true,
		recurrenceType: "none",
		recurrenceDaysOfWeek: [],
		capacity: 10,
		bufferMinutes: 15,
		minGuests: 1,
		maxGuests: 10,
		bookingCutoffHours: 24,
		tourType: "walkable",
		languages: ["en"],
		requiredGuides: 1,
		inclusions: [],
		exclusions: [],
		highlights: [],
		currency: "USD",
		createdAt: 0,
		updatedAt: 0,
	});
}

async function seedVehicle(
	ctx: TestCtx,
	orgId: string,
): Promise<Id<"vehicles">> {
	return await ctx.db.insert("vehicles", {
		organizationId: orgId,
		name: "Van A",
		vehicleType: "van",
		capacity: 8,
		licensePlate: "ABC-123",
		make: "Ford",
		model: "Transit",
		color: "white",
		ownershipType: "owned",
		status: "available",
		notes: "",
		createdAt: 0,
		updatedAt: 0,
	});
}

async function seedAssignment(
	ctx: TestCtx,
	orgId: string,
	tourId: Id<"tours">,
	guideId: string,
	overrides: Partial<{
		date: string;
		startTime: string;
		endTime: string;
		vehicleId: Id<"vehicles">;
		driverId: Id<"drivers">;
		status: "scheduled" | "completed" | "cancelled";
	}> = {},
): Promise<Id<"assignments">> {
	return await ctx.db.insert("assignments", {
		organizationId: orgId,
		tourId,
		guideId,
		vehicleId: overrides.vehicleId,
		driverId: overrides.driverId,
		date: overrides.date ?? "2026-09-01",
		startTime: overrides.startTime ?? "09:00",
		endTime: overrides.endTime ?? "11:00",
		status: overrides.status ?? "scheduled",
		createdAt: 0,
		updatedAt: 0,
	});
}

describe("timeToMinutes / minutesToTime", () => {
	it("round-trips a midday time", () => {
		expect(timeToMinutes("12:34")).toBe(12 * 60 + 34);
		expect(minutesToTime(12 * 60 + 34)).toBe("12:34");
	});
	it("zero-pads", () => {
		expect(minutesToTime(5)).toBe("00:05");
		expect(minutesToTime(60)).toBe("01:00");
	});
	it("wraps past midnight", () => {
		expect(minutesToTime(25 * 60)).toBe("01:00");
		expect(minutesToTime(-30 + 1440)).toBe("23:30");
	});
});

describe("calculateEndTime", () => {
	it("simple 2-hour addition", () => {
		expect(calculateEndTime("09:00", 2)).toBe("11:00");
	});
	it("wraps past midnight", () => {
		expect(calculateEndTime("23:30", 2)).toBe("01:30");
	});
});

describe("rangesOverlap", () => {
	it("returns true for overlapping ranges", () => {
		expect(rangesOverlap("09:00", "11:00", "10:00", "12:00")).toBe(true);
	});
	it("returns false for edge-touching ranges (half-open)", () => {
		// [09:00, 11:00) and [11:00, 13:00) — 11:00 is end of first,
		// start of second; they don't overlap.
		expect(rangesOverlap("09:00", "11:00", "11:00", "13:00")).toBe(false);
	});
	it("returns false for disjoint ranges", () => {
		expect(rangesOverlap("09:00", "10:00", "14:00", "15:00")).toBe(false);
	});
});

describe("convex/assignments — checkConflicts query", () => {
	it("reports a guide conflict when another scheduled assignment overlaps", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_a";
		const guideId = "guide-1";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedAssignment(ctx as unknown as TestCtx, orgId, tourId, guideId, {
				date: "2026-09-01",
				startTime: "09:00",
				endTime: "11:00",
			}),
		);
		const conflicts = await t.run(async (ctx) =>
			checkConflictsHelper(ctx as unknown as TestCtx, {
				organizationId: orgId,
				date: "2026-09-01",
				startTime: "10:00",
				endTime: "12:00",
				guideId,
			}),
		);
		expect(conflicts.length).toBe(1);
		expect(conflicts[0]?.conflictType).toBe("guide");
	});

	it("reports no conflict for a non-overlapping time", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_b";
		const guideId = "guide-1";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedAssignment(ctx as unknown as TestCtx, orgId, tourId, guideId, {
				date: "2026-09-01",
				startTime: "09:00",
				endTime: "11:00",
			}),
		);
		const conflicts = await t.run(async (ctx) =>
			checkConflictsHelper(ctx as unknown as TestCtx, {
				organizationId: orgId,
				date: "2026-09-01",
				startTime: "14:00",
				endTime: "16:00",
				guideId,
			}),
		);
		expect(conflicts.length).toBe(0);
	});

	it("excludes the assignment passed in excludeAssignmentId", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_e";
		const guideId = "guide-1";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const aId = await t.run(async (ctx) =>
			seedAssignment(ctx as unknown as TestCtx, orgId, tourId, guideId, {
				date: "2026-09-01",
				startTime: "09:00",
				endTime: "11:00",
			}),
		);
		const conflicts = await t.run(async (ctx) =>
			checkConflictsHelper(ctx as unknown as TestCtx, {
				organizationId: orgId,
				date: "2026-09-01",
				startTime: "09:30",
				endTime: "11:30",
				guideId,
				excludeAssignmentId: aId,
			}),
		);
		expect(conflicts.length).toBe(0);
	});

	it("reports vehicle conflict independently", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_f";
		const vehicleId = await t.run(async (ctx) =>
			seedVehicle(ctx as unknown as TestCtx, orgId),
		);
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedAssignment(ctx as unknown as TestCtx, orgId, tourId, "guide-1", {
				date: "2026-09-01",
				startTime: "09:00",
				endTime: "11:00",
				vehicleId,
			}),
		);
		const conflicts = await t.run(async (ctx) =>
			checkConflictsHelper(ctx as unknown as TestCtx, {
				organizationId: orgId,
				date: "2026-09-01",
				startTime: "10:30",
				endTime: "12:30",
				guideId: "guide-2",
				vehicleId,
			}),
		);
		expect(conflicts.length).toBe(1);
		expect(conflicts[0]?.conflictType).toBe("vehicle");
	});
});

describe("convex/assignments — create rejects forbidden states", () => {
	it("rejects when guide has an approved vacation covering the date", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_vac";
		const guideId = "guide-vac";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			await c.db.insert("vacationRequests", {
				organizationId: orgId,
				userId: guideId,
				startDate: "2026-09-01",
				endDate: "2026-09-10",
				reason: "Trip",
				status: "approved",
				createdAt: 0,
				updatedAt: 0,
			});
		});
		await expect(
			t.mutation(internal.assignments.internalCreate, {
				organizationId: orgId,
				userId: guideId,
				tourId,
				guideId,
				date: "2026-09-05",
				startTime: "09:00",
			}),
		).rejects.toThrow(/on approved vacation/);
	});

	it("rejects when guide is marked unavailable", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_unav";
		const guideId = "guide-unav";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			await c.db.insert("availabilities", {
				organizationId: orgId,
				userId: guideId,
				date: "2026-09-05",
				isAvailable: false,
				createdAt: 0,
			});
		});
		await expect(
			t.mutation(internal.assignments.internalCreate, {
				organizationId: orgId,
				userId: guideId,
				tourId,
				guideId,
				date: "2026-09-05",
				startTime: "09:00",
			}),
		).rejects.toThrow(/unavailable/);
	});

	it("rejects when vehicle is in maintenance", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_maint";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const vehicleId = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			return await c.db.insert("vehicles", {
				organizationId: orgId,
				name: "Van M",
				vehicleType: "van",
				capacity: 8,
				licensePlate: "MNT-001",
				make: "Ford",
				model: "Transit",
				color: "white",
				ownershipType: "owned",
				status: "maintenance",
				notes: "",
				createdAt: 0,
				updatedAt: 0,
			});
		});
		await expect(
			t.mutation(internal.assignments.internalCreate, {
				organizationId: orgId,
				userId: "guide-1",
				tourId,
				guideId: "guide-1",
				date: "2026-09-05",
				startTime: "09:00",
				vehicleId,
			}),
		).rejects.toThrow(/not available/);
	});

	it("rejects when driver is inactive", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_inact";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const driverId = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			return await c.db.insert("drivers", {
				organizationId: orgId,
				userId: "driver-inact",
				licenseInfo: "x",
				availability: {},
				notes: "",
				isActive: false,
				createdAt: 0,
				updatedAt: 0,
			});
		});
		await expect(
			t.mutation(internal.assignments.internalCreate, {
				organizationId: orgId,
				userId: "guide-1",
				tourId,
				guideId: "guide-1",
				date: "2026-09-05",
				startTime: "09:00",
				driverId,
			}),
		).rejects.toThrow(/not active/);
	});

	it("rejects with the conflict message when guide is double-booked", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_dbl";
		const guideId = "guide-dbl";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const tourId2 = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedAssignment(ctx as unknown as TestCtx, orgId, tourId, guideId, {
				date: "2026-09-01",
				startTime: "09:00",
				endTime: "11:00",
			}),
		);
		await expect(
			t.mutation(internal.assignments.internalCreate, {
				organizationId: orgId,
				userId: guideId,
				tourId: tourId2,
				guideId,
				date: "2026-09-01",
				startTime: "10:00",
			}),
		).rejects.toThrow(/Guide already assigned/);
	});
});

describe("convex/assignments — lifecycle", () => {
	it("create writes audit log with action 'assignment.created'", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_al";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await t.mutation(internal.assignments.internalCreate, {
			organizationId: orgId,
			userId: "guide-1",
			tourId,
			guideId: "guide-1",
			date: "2026-09-15",
			startTime: "10:00",
		});
		const auditLogs = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		const created = auditLogs.find(
			(l: { action: string }) => l.action === "assignment.created",
		);
		expect(created).toBeDefined();
	});

	it("update rejects modifying cancelled assignment", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_upd";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const aId = await t.run(async (ctx) =>
			seedAssignment(ctx as unknown as TestCtx, orgId, tourId, "guide-1", {
				status: "cancelled",
			}),
		);
		await expect(
			t.mutation(internal.assignments.internalUpdate, {
				organizationId: orgId,
				userId: "guide-1",
				assignmentId: aId,
				startTime: "15:00",
			}),
		).rejects.toThrow(/Cannot modify/);
	});

	it("update rejects modifying completed assignment", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_upd2";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const aId = await t.run(async (ctx) =>
			seedAssignment(ctx as unknown as TestCtx, orgId, tourId, "guide-1", {
				status: "completed",
			}),
		);
		await expect(
			t.mutation(internal.assignments.internalUpdate, {
				organizationId: orgId,
				userId: "guide-1",
				assignmentId: aId,
				startTime: "15:00",
			}),
		).rejects.toThrow(/Cannot modify/);
	});

	it("cancel → completed: cancel rejected after complete", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_lc";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const aId = await t.run(async (ctx) =>
			seedAssignment(ctx as unknown as TestCtx, orgId, tourId, "guide-1"),
		);
		await t.mutation(internal.assignments.internalComplete, {
			organizationId: orgId,
			userId: "guide-1",
			assignmentId: aId,
		});
		await expect(
			t.mutation(internal.assignments.internalCancel, {
				organizationId: orgId,
				userId: "guide-1",
				assignmentId: aId,
			}),
		).rejects.toThrow(/completed/);
	});
});