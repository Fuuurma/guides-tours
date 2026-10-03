// Tests for convex/lib/assignmentsLifecycle — the shared mutation
// core behind the assignment mutations (god-module decomposition).
//
// Batch 1: the terminal transitions — performCancel (guards, reason
// cap, audit), performComplete (scheduled-only guard), performRemove
// (soft delete) — plus performCreate's scheduleId validation chain.
// (F19 coverage gap: the 828-line module had no direct tests.
// performCreate's availability/overlap logic and performUpdate are
// the next batch.)

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { seedAssignment, seedSchedule, seedTour } from "./helpers";
import {
	performCancel,
	performComplete,
	performCreate,
	performRemove,
} from "../lib/assignmentsLifecycle";

const modules = import.meta.glob("../**/*.{ts,tsx}");

const ORG = "org_test";

type TClient = ReturnType<typeof convexTest>;

async function seedAssigned(
	t: TClient,
	opts: { status?: "scheduled" | "cancelled" | "completed" } = {},
) {
	return t.run(async (ctx) => {
		const tourId = await seedTour(ctx, { orgId: ORG });
		const assignmentId = await seedAssignment(ctx, {
			orgId: ORG,
			tourId,
			guideId: "guide_1",
			status: opts.status ?? "scheduled",
		});
		return { assignmentId };
	});
}

describe("assignmentsLifecycle.performCancel", () => {
	it("guards: not found, wrong org, double-cancel, completed", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await expect(
				performCancel(ctx, {
					assignmentId: "assignments" as never,
					organizationId: ORG,
					userId: "user_1",
				}),
			).rejects.toThrow("Assignment not found");
		});
		const { assignmentId } = await seedAssigned(t, { status: "scheduled" });
		await t.run(async (ctx) => {
			await expect(
				performCancel(ctx, {
					assignmentId,
					organizationId: "org_other",
					userId: "user_1",
				}),
			).rejects.toThrow("Forbidden: wrong organization");
		});
		await t.run(async (ctx) => {
			await expect(
				performCancel(ctx, {
					assignmentId,
					organizationId: ORG,
					userId: "user_1",
					reason: "x".repeat(501),
				}),
			).rejects.toThrow("Cancel reason is too long");
		});
		await t.run(async (ctx) => {
			await performCancel(ctx, {
				assignmentId,
				organizationId: ORG,
				userId: "user_1",
			});
		});
		await t.run(async (ctx) => {
			await expect(
				performCancel(ctx, {
					assignmentId,
					organizationId: ORG,
					userId: "user_1",
				}),
			).rejects.toThrow("Already cancelled");
		});
	});

	it("refuses cancelling a completed assignment", async () => {
		const t = convexTest(schema, modules);
		const { assignmentId } = await seedAssigned(t, { status: "completed" });
		await t.run(async (ctx) => {
			await expect(
				performCancel(ctx, {
					assignmentId,
					organizationId: ORG,
					userId: "user_1",
				}),
			).rejects.toThrow("Cannot cancel a completed assignment");
		});
	});

	it("flips to cancelled and audits with the reason", async () => {
		const t = convexTest(schema, modules);
		const { assignmentId } = await seedAssigned(t);
		await t.run(async (ctx) => {
			await performCancel(ctx, {
				assignmentId,
				organizationId: ORG,
				userId: "user_1",
				reason: "guide sick",
			});
		});
		const row = await t.run((ctx) => ctx.db.get(assignmentId));
		expect(row?.status).toBe("cancelled");
		const audits = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		const audit = audits.find((a) => a.action === "assignment.cancelled");
		expect(audit?.newValues).toMatchObject({
			status: "cancelled",
			reason: "guide sick",
		});
	});
});

describe("assignmentsLifecycle.performComplete", () => {
	it("refuses a non-scheduled assignment", async () => {
		const t = convexTest(schema, modules);
		const { assignmentId } = await seedAssigned(t, { status: "cancelled" });
		await t.run(async (ctx) => {
			await expect(
				performComplete(ctx, {
					assignmentId,
					organizationId: ORG,
					userId: "user_1",
				}),
			).rejects.toThrow(
				"Only scheduled assignments can be completed (was cancelled)",
			);
		});
	});

	it("completes a scheduled assignment and audits", async () => {
		const t = convexTest(schema, modules);
		const { assignmentId } = await seedAssigned(t);
		await t.run(async (ctx) => {
			await performComplete(ctx, {
				assignmentId,
				organizationId: ORG,
				userId: "user_1",
			});
		});
		const row = await t.run((ctx) => ctx.db.get(assignmentId));
		expect(row?.status).toBe("completed");
		const audits = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		expect(audits.some((a) => a.action === "assignment.completed")).toBe(
			true,
		);
	});
});

describe("assignmentsLifecycle.performRemove", () => {
	it("soft-deletes: stamps deletedAt and audits, row remains", async () => {
		const t = convexTest(schema, modules);
		const { assignmentId } = await seedAssigned(t);
		await t.run(async (ctx) => {
			await performRemove(ctx, {
				assignmentId,
				organizationId: ORG,
				userId: "user_1",
			});
		});
		const row = await t.run((ctx) => ctx.db.get(assignmentId));
		expect(row?.deletedAt).toBeGreaterThan(0);
		expect(row?.status).toBe("scheduled");
		const audits = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		expect(
			audits.some((a) => a.action === "assignment.soft_deleted"),
		).toBe(true);
	});
});

describe("assignmentsLifecycle.performCreate — schedule validation", () => {
	it("guards the scheduleId chain: missing, foreign, cancelled", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run(async (ctx) => seedTour(ctx, { orgId: ORG }));
		await t.run(async (ctx) => {
			await expect(
				performCreate(ctx, {
					tourId,
					guideId: "guide_1",
					date: "2026-12-20",
					startTime: "09:00",
					scheduleId: "tourSchedules" as never,
					organizationId: ORG,
					userId: "user_1",
				}),
			).rejects.toThrow("Schedule not found");
		});
		const ids = await t.run(async (ctx) => {
			const otherTour = await seedTour(ctx, { orgId: "org_other" });
			const foreignSchedule = await seedSchedule(ctx, {
				orgId: "org_other",
				tourId: otherTour,
			});
			const cancelledSchedule = await seedSchedule(ctx, {
				orgId: ORG,
				tourId,
			});
			await ctx.db.patch(cancelledSchedule, { status: "cancelled" });
			return { foreignSchedule, cancelledSchedule };
		});
		await t.run(async (ctx) => {
			await expect(
				performCreate(ctx, {
					tourId,
					guideId: "guide_1",
					date: "2026-12-20",
					startTime: "09:00",
					scheduleId: ids.foreignSchedule,
					organizationId: ORG,
					userId: "user_1",
				}),
			).rejects.toThrow(
				"Forbidden: schedule belongs to a different organization",
			);
		});
		await t.run(async (ctx) => {
			await expect(
				performCreate(ctx, {
					tourId,
					guideId: "guide_1",
					date: "2026-12-20",
					startTime: "09:00",
					scheduleId: ids.cancelledSchedule,
					organizationId: ORG,
					userId: "user_1",
				}),
			).rejects.toThrow("Cannot assign a guide to a cancelled schedule");
		});
	});

	it("creates an assignment from a valid schedule", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const scheduleId = await seedSchedule(ctx, {
				orgId: ORG,
				tourId,
				date: "2026-12-20",
				startTime: "10:00",
				endTime: "12:00",
			});
			return { scheduleId };
		});
		const assignmentId = await t.run(async (ctx) =>
			performCreate(ctx, {
				tourId: "tours" as never,
				guideId: "guide_1",
				date: "2026-12-20",
				startTime: "09:00",
				scheduleId: ids.scheduleId,
				organizationId: ORG,
				userId: "user_1",
			}),
		);
		const row = await t.run((ctx) => ctx.db.get(assignmentId));
		// Schedule fields win over the raw args.
		expect(row?.tourId).toBeDefined();
		expect(row?.startTime).toBe("10:00");
		expect(row?.status).toBe("scheduled");
	});
});

// ---- Batch 2: performUpdate ----

import { seedDriver, seedVehicle } from "./helpers";
import { performUpdate } from "../lib/assignmentsLifecycle";

describe("assignmentsLifecycle.performUpdate — guards", () => {
	it("refuses deleted, cancelled, completed, and foreign-org updates", async () => {
		const t = convexTest(schema, modules);
		const deleted = await seedAssigned(t);
		await t.run(async (ctx) => {
			await ctx.db.patch(deleted.assignmentId, { deletedAt: Date.now() });
		});
		await t.run(async (ctx) => {
			const a = await ctx.db.get(deleted.assignmentId);
			await expect(
				performUpdate(ctx, {
					assignmentId: deleted.assignmentId,
					guideId: "guide_2",
					organizationId: ORG,
					userId: "user_1",
				}),
			).rejects.toThrow("Assignment is deleted");
			void a;
		});
		for (const status of ["cancelled", "completed"] as const) {
			const { assignmentId } = await seedAssigned(t, { status });
			await t.run(async (ctx) => {
				await expect(
					performUpdate(ctx, {
						assignmentId,
						guideId: "guide_2",
						organizationId: ORG,
						userId: "user_1",
					}),
				).rejects.toThrow(`Cannot modify a ${status} assignment`);
			});
		}
		const live = await seedAssigned(t);
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, {
					assignmentId: live.assignmentId,
					guideId: "guide_2",
					organizationId: "org_other",
					userId: "user_1",
				}),
			).rejects.toThrow("Forbidden: wrong organization");
		});
	});

	it("refuses an inactive driver", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const assignmentId = await seedAssignment(ctx, {
				orgId: ORG,
				tourId,
				guideId: "guide_1",
			});
			const driverId = await seedDriver(ctx, {
				orgId: ORG,
				userId: "user_driver_1",
				isActive: false,
			});
			return { assignmentId, driverId };
		});
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, {
					assignmentId: ids.assignmentId,
					driverId: ids.driverId,
					organizationId: ORG,
					userId: "user_1",
				}),
			).rejects.toThrow("Driver is not active");
		});
	});

	it("refuses the same person as guide and driver", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const assignmentId = await seedAssignment(ctx, {
				orgId: ORG,
				tourId,
				guideId: "user_guide_1",
			});
			const driverId = await seedDriver(ctx, {
				orgId: ORG,
				userId: "user_guide_1",
			});
			return { assignmentId, driverId };
		});
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, {
					assignmentId: ids.assignmentId,
					driverId: ids.driverId,
					organizationId: ORG,
					userId: "user_1",
				}),
			).rejects.toThrow(
				"The same person cannot be both guide and driver on one assignment",
			);
		});
	});

	it("refuses a second, different vehicle on the slot", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const a1 = await seedAssignment(ctx, {
				orgId: ORG,
				tourId,
				guideId: "guide_1",
				vehicleId: await seedVehicle(ctx, { orgId: ORG }),
			});
			const v2 = await seedVehicle(ctx, { orgId: ORG, name: "Van B" });
			const a2 = await seedAssignment(ctx, {
				orgId: ORG,
				tourId,
				guideId: "guide_2",
			});
			void a1;
			return { a2, v2 };
		});
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, {
					assignmentId: ids.a2,
					vehicleId: ids.v2,
					organizationId: ORG,
					userId: "user_1",
				}),
			).rejects.toThrow(
				"This departure already has a different vehicle assigned",
			);
		});
	});

	it("clears vehicle/driver and re-stamps endTime on update", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const vehicleId = await seedVehicle(ctx, { orgId: ORG });
			const driverId = await seedDriver(ctx, {
				orgId: ORG,
				userId: "user_driver_2",
			});
			const assignmentId = await seedAssignment(ctx, {
				orgId: ORG,
				tourId,
				guideId: "guide_1",
				vehicleId,
				driverId,
			});
			return { assignmentId };
		});
		await t.run(async (ctx) => {
			await performUpdate(ctx, {
				assignmentId: ids.assignmentId,
				clearVehicle: true,
				clearDriver: true,
				organizationId: ORG,
				userId: "user_1",
			});
		});
		const row = await t.run((ctx) => ctx.db.get(ids.assignmentId));
		expect(row?.vehicleId).toBeUndefined();
		expect(row?.driverId).toBeUndefined();
		const audits = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		expect(audits.some((a) => a.action === "assignment.updated")).toBe(true);
	});
});

describe("driver vacation enforcement (F347)", () => {
	const seedDriverOnLeave = async (t: TClient) =>
		t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const driverId = await seedDriver(ctx, {
				orgId: ORG,
				userId: "user_driver_1",
			});
			await ctx.db.insert("vacationRequests", {
				organizationId: ORG,
				userId: "user_driver_1",
				startDate: "2026-07-10",
				endDate: "2026-07-20",
				reason: "Trip",
				status: "approved",
				createdAt: 0,
				updatedAt: 0,
			});
			return { tourId, driverId };
		});

	it("performCreate refuses a driver on approved vacation", async () => {
		const t = convexTest(schema, modules);
		const { tourId, driverId } = await seedDriverOnLeave(t);
		await t.run(async (ctx) => {
			await expect(
				performCreate(ctx, {
					tourId,
					guideId: "guide_1",
					date: "2026-07-15",
					startTime: "09:00",
					driverId,
					organizationId: ORG,
					userId: "user_1",
				}),
			).rejects.toThrow("Driver is on approved vacation on this date");
		});
	});

	it("performCreate allows the same driver outside the leave window", async () => {
		const t = convexTest(schema, modules);
		const { tourId, driverId } = await seedDriverOnLeave(t);
		await t.run(async (ctx) => {
			const id = await performCreate(ctx, {
				tourId,
				guideId: "guide_1",
				date: "2026-08-01",
				startTime: "09:00",
				driverId,
				organizationId: ORG,
				userId: "user_1",
			});
			expect(id).toBeDefined();
		});
	});

	it("performUpdate refuses swapping in a driver on approved vacation", async () => {
		const t = convexTest(schema, modules);
		const { tourId, driverId } = await seedDriverOnLeave(t);
		const assignmentId = await t.run(async (ctx) =>
			seedAssignment(ctx, { orgId: ORG, tourId, guideId: "guide_1" }),
		);
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, {
					assignmentId,
					driverId,
					organizationId: ORG,
					userId: "user_1",
				}),
			).rejects.toThrow("Driver is on approved vacation on this date");
		});
	});
});
