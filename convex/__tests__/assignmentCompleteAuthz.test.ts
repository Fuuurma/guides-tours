// GT-AUDIT-07 — a guide could complete any other guide's assignment.
//
// `complete` admits owner/admin/member/guide and forwards
// `userId: member.userId` into `performComplete`, which checked
// organization, deletedAt and status — but never compared the caller
// against `a.guideId`. So any guide in the org could close any other
// guide's departure, which is precisely the action the declared matrix
// withholds from that role (authz: guide holds assignment:["read"]).
//
// The fix scopes GUIDE-role callers to their own assignment. owner,
// admin and member keep the cross-guide power they already had — a
// dispatcher closing a shift on a guide's behalf is a real workflow, and
// narrowing it would be a behaviour change nobody asked for.
//
// `guideId` is a Better Auth userId, not a driver row id: performCreate
// resolves it through `drivers.userId` before storing.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { seedAssignment, seedTour } from "./helpers";
import { performComplete } from "../lib/assignmentsLifecycle";

const modules = import.meta.glob("../**/*.{ts,tsx}");

const ORG = "org_test";
const GUIDE = "guide_1";
const OTHER_GUIDE = "guide_2";

type TClient = ReturnType<typeof convexTest>;

async function seedAssigned(t: TClient, guideId: string = GUIDE) {
	return t.run(async (ctx) => {
		const tourId = await seedTour(ctx, { orgId: ORG });
		const assignmentId = await seedAssignment(ctx, {
			orgId: ORG,
			tourId,
			guideId,
			status: "scheduled",
		});
		return { assignmentId };
	});
}

describe("GT-AUDIT-07 — a guide may only complete their own assignment", () => {
	it("refuses a guide completing another guide's assignment", async () => {
		const t = convexTest(schema, modules);
		const { assignmentId } = await seedAssigned(t, OTHER_GUIDE);

		await t.run(async (ctx) => {
			await expect(
				performComplete(ctx, {
					assignmentId,
					organizationId: ORG,
					userId: GUIDE,
					callerRole: "guide",
				}),
			).rejects.toThrow("Forbidden: not your assignment");
		});

		// The refusal must not have half-applied the transition.
		const row = await t.run((ctx) => ctx.db.get(assignmentId));
		expect(row?.status).toBe("scheduled");
		const audits = await t.run((ctx) => ctx.db.query("auditLogs").collect());
		expect(audits.some((a) => a.action === "assignment.completed")).toBe(false);
	});

	it("still lets a guide close their own departure", async () => {
		const t = convexTest(schema, modules);
		const { assignmentId } = await seedAssigned(t, GUIDE);

		await t.run(async (ctx) => {
			await performComplete(ctx, {
				assignmentId,
				organizationId: ORG,
				userId: GUIDE,
				callerRole: "guide",
			});
		});

		const row = await t.run((ctx) => ctx.db.get(assignmentId));
		expect(row?.status).toBe("completed");
	});

	it("leaves owner, admin and member able to complete on a guide's behalf", async () => {
		for (const callerRole of ["owner", "admin", "member"]) {
			const t = convexTest(schema, modules);
			const { assignmentId } = await seedAssigned(t, OTHER_GUIDE);

			await t.run(async (ctx) => {
				await performComplete(ctx, {
					assignmentId,
					organizationId: ORG,
					userId: "dispatcher_1",
					callerRole,
				});
			});

			const row = await t.run((ctx) => ctx.db.get(assignmentId));
			expect(row?.status, `${callerRole} must retain the cross-guide power`).toBe(
				"completed",
			);
		}
	});
});