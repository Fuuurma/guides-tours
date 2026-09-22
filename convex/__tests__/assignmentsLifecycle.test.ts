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
