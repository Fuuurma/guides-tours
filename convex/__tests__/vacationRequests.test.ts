import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal, api } from "../_generated/api";
import { calculateVacationDays } from "../vacationRequests";

const modules = import.meta.glob("../**/*.{ts,tsx}");

describe("calculateVacationDays", () => {
	it("counts inclusive days within a single year", () => {
		expect(calculateVacationDays("2026-07-01", "2026-07-14", 2026)).toBe(14);
	});

	it("single day counts as 1", () => {
		expect(calculateVacationDays("2026-07-01", "2026-07-01", 2026)).toBe(1);
	});

	it("clamps start to year boundary", () => {
		expect(calculateVacationDays("2025-12-28", "2026-01-03", 2026)).toBe(3);
	});

	it("clamps end to year boundary", () => {
		expect(calculateVacationDays("2026-12-28", "2027-01-03", 2026)).toBe(4);
	});

	it("returns 0 when fully outside the year", () => {
		expect(calculateVacationDays("2025-12-01", "2025-12-31", 2026)).toBe(0);
	});
});

describe("vacation requests", () => {
	it("create: stores a pending request", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v1";
		const userId = "guide-1";
		const requestId = await t.run(async (ctx) =>
			ctx.db.insert("vacationRequests", {
				organizationId: orgId,
				userId,
				startDate: "2026-07-01",
				endDate: "2026-07-14",
				reason: "Family trip",
				status: "pending",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);
		const vr = await t.run(async (ctx) => ctx.db.get(requestId));
		expect(vr).toBeDefined();
		expect(vr!.status).toBe("pending");
		expect(vr!.startDate).toBe("2026-07-01");
		expect(vr!.endDate).toBe("2026-07-14");
	});

	it("create: rejects end date before start date", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(internal.vacationRequests.internalCreate, {
				organizationId: "org_v2",
				userId: "guide-1",
				startDate: "2026-07-14",
				endDate: "2026-07-01",
			}),
		).rejects.toThrow(/End date must be on or after start date/);
	});

	it("create: rejects overlapping pending request", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v3";
		const userId = "guide-1";
		await t.run(async (ctx) =>
			ctx.db.insert("vacationRequests", {
				organizationId: orgId,
				userId,
				startDate: "2026-07-01",
				endDate: "2026-07-14",
				reason: "",
				status: "pending",
				createdAt: 0,
				updatedAt: 0,
			}),
		);
		await expect(
			t.mutation(internal.vacationRequests.internalCreate, {
				organizationId: orgId,
				userId,
				startDate: "2026-07-10",
				endDate: "2026-07-20",
			}),
		).rejects.toThrow(/overlaps/);
	});

	it("create: allows non-overlapping request", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v4";
		const userId = "guide-1";
		await t.run(async (ctx) =>
			ctx.db.insert("vacationRequests", {
				organizationId: orgId,
				userId,
				startDate: "2026-07-01",
				endDate: "2026-07-14",
				reason: "",
				status: "pending",
				createdAt: 0,
				updatedAt: 0,
			}),
		);
		const id = await t.mutation(internal.vacationRequests.internalCreate, {
			organizationId: orgId,
			userId,
			startDate: "2026-08-01",
			endDate: "2026-08-10",
		});
		expect(id).toBeDefined();
	});

	it("approve: transitions pending to approved", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v5";
		const userId = "guide-1";
		const requestId = await t.run(async (ctx) =>
			ctx.db.insert("vacationRequests", {
				organizationId: orgId,
				userId,
				startDate: "2026-07-01",
				endDate: "2026-07-14",
				reason: "",
				status: "pending",
				createdAt: 0,
				updatedAt: 0,
			}),
		);
		await t.mutation(internal.vacationRequests.internalApprove, {
			organizationId: orgId,
			userId: "admin-1",
			requestId,
			reason: "Approved!",
		});
		const vr = await t.run(async (ctx) => ctx.db.get(requestId));
		expect(vr!.status).toBe("approved");
		expect(vr!.reviewedBy).toBe("admin-1");
		expect(vr!.reviewedAt).toBeDefined();
		expect(vr!.reason).toBe("Approved!");
	});

	it("approve: rejects already approved request", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v6";
		const requestId = await t.run(async (ctx) =>
			ctx.db.insert("vacationRequests", {
				organizationId: orgId,
				userId: "guide-1",
				startDate: "2026-07-01",
				endDate: "2026-07-14",
				reason: "",
				status: "approved",
				reviewedBy: "admin-1",
				reviewedAt: 100,
				createdAt: 0,
				updatedAt: 0,
			}),
		);
		await expect(
			t.mutation(internal.vacationRequests.internalApprove, {
				organizationId: orgId,
				userId: "admin-2",
				requestId,
			}),
		).rejects.toThrow(/Only pending requests can be approved/);
	});

	it("reject: transitions pending to rejected", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v7";
		const requestId = await t.run(async (ctx) =>
			ctx.db.insert("vacationRequests", {
				organizationId: orgId,
				userId: "guide-1",
				startDate: "2026-07-01",
				endDate: "2026-07-14",
				reason: "",
				status: "pending",
				createdAt: 0,
				updatedAt: 0,
			}),
		);
		await t.mutation(internal.vacationRequests.internalReject, {
			organizationId: orgId,
			userId: "admin-1",
			requestId,
			reason: "Too busy",
		});
		const vr = await t.run(async (ctx) => ctx.db.get(requestId));
		expect(vr!.status).toBe("rejected");
		expect(vr!.reviewedBy).toBe("admin-1");
		expect(vr!.reason).toBe("Too busy");
	});

	it("reject: rejects already rejected request", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v8";
		const requestId = await t.run(async (ctx) =>
			ctx.db.insert("vacationRequests", {
				organizationId: orgId,
				userId: "guide-1",
				startDate: "2026-07-01",
				endDate: "2026-07-14",
				reason: "",
				status: "rejected",
				reviewedBy: "admin-1",
				reviewedAt: 100,
				createdAt: 0,
				updatedAt: 0,
			}),
		);
		await expect(
			t.mutation(internal.vacationRequests.internalReject, {
				organizationId: orgId,
				userId: "admin-2",
				requestId,
			}),
		).rejects.toThrow(/Only pending requests can be rejected/);
	});

	it("approve: writes audit log", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v9";
		const requestId = await t.run(async (ctx) =>
			ctx.db.insert("vacationRequests", {
				organizationId: orgId,
				userId: "guide-1",
				startDate: "2026-07-01",
				endDate: "2026-07-14",
				reason: "",
				status: "pending",
				createdAt: 0,
				updatedAt: 0,
			}),
		);
		await t.mutation(internal.vacationRequests.internalApprove, {
			organizationId: orgId,
			userId: "admin-1",
			requestId,
		});
		const logs = await t.run(async (ctx) =>
			ctx.db
				.query("auditLogs")
				.filter((q) => q.eq(q.field("resourceId"), requestId))
				.collect(),
		);
		expect(logs.length).toBe(1);
		expect(logs[0]!.action).toBe("vacation_request.approved");
	});

	it("getStats: returns correct counts", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v10";
		const userId = "guide-stats";
		// Approved: 10 days
		await t.run(async (ctx) =>
			ctx.db.insert("vacationRequests", {
				organizationId: orgId,
				userId,
				startDate: "2026-07-01",
				endDate: "2026-07-10",
				reason: "",
				status: "approved",
				reviewedBy: "admin-1",
				reviewedAt: 100,
				createdAt: 0,
				updatedAt: 0,
			}),
		);
		// Pending: 5 days
		await t.run(async (ctx) =>
			ctx.db.insert("vacationRequests", {
				organizationId: orgId,
				userId,
				startDate: "2026-08-01",
				endDate: "2026-08-05",
				reason: "",
				status: "pending",
				createdAt: 0,
				updatedAt: 0,
			}),
		);
		const stats = await t.query(api.vacationRequests.getStats, {
			organizationId: orgId,
			userId,
			year: 2026,
		});
		expect(stats.usedDays).toBe(10);
		expect(stats.remainingDays).toBe(10);
		expect(stats.pendingCount).toBe(1);
		expect(stats.totalDays).toBe(20);
	});
});
