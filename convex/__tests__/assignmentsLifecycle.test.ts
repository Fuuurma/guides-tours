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
import { api, internal } from "../_generated/api";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
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

// Auth seam (same vi.mock("../auth") pattern as files_remove_gate.test.ts):
// requireRole and the default org-member lookup resolve against these lists.
const { mockState } = vi.hoisted(() => ({
	mockState: { user: null as { _id: string; name: string; email: string } | null },
}));
const MEMBERS: Record<string, Array<{ userId: string; role: string }>> = {
	org_test: [
		{ userId: "user_admin", role: "admin" },
		{ userId: "guide_in", role: "guide" },
	],
	org_other: [{ userId: "guide_out", role: "guide" }],
};

vi.mock("../auth", () => ({
	authComponent: {
		getAuthUser: async () => mockState.user,
		safeGetAuthUser: async () => mockState.user ?? undefined,
		getAuth: async () => ({
			auth: {
				api: {
					getSession: async () =>
						mockState.user
							? { session: { activeOrganizationId: "org_test" }, user: mockState.user }
							: null,
					listOrganizations: async () => [{ id: "org_test", name: "Org" }],
					listMembers: async (args: { query: { organizationId: string } }) => ({
						members: MEMBERS[args.query.organizationId] ?? [],
					}),
				},
			},
			headers: new Headers(),
		}),
	},
	createAuth: (() => ({})) as never,
}));

function signInAsAdmin() {
	mockState.user = { _id: "user_admin", name: "Admin", email: "a@t.dev" };
}

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
					callerRole: "admin",
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
				callerRole: "admin",
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
import { assertGuideAssignable } from "../lib/assignmentsShared";

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

// ---- GT-AUDIT-02 / hub F594: cross-tenant guide reassignment ----
//
// performUpdate is the write of `guideId` and had no org-membership check:
// `create` refused a foreign guideId ("Guide is not a member of this
// organization") while reassignment accepted any caller-chosen id and then
// notified that user with the org's tour name, date and times.
//
// The policy is tested through the injectable lookup rather than through the
// Better Auth component, because under convex-test there is no auth session —
// the default lookup throws Unauthorized and would make every assertion here
// pass for the wrong reason. Two layers instead:
//   1. the policy (reject non-member, reject wrong role, allow guide) with a
//      stub lookup — exact messages, no auth dependency;
//   2. the wiring — performUpdate reaches the check and leaves the row
//      untouched when it rejects.

describe("assertGuideAssignable — guide membership policy", () => {
	const ORG_ID = "org_policy";
	const noopLookup = () => Promise.resolve(null);
	const asLookup =
		(role: string) => () =>
			Promise.resolve({ userId: "u1", role });

	async function ctx() {
		return {} as never;
	}

	it("rejects a guideId that is not a member of the org", async () => {
		await expect(
			assertGuideAssignable(await ctx(), ORG_ID, "outsider", noopLookup),
		).rejects.toThrow("Guide is not a member of this organization");
	});

	it("rejects a member whose role cannot be assigned as guide", async () => {
		for (const role of ["member", "driver", undefined]) {
			await expect(
				assertGuideAssignable(await ctx(), ORG_ID, "u1", asLookup(role as string)),
			).rejects.toThrow("cannot be assigned as guide");
		}
	});

	it("accepts guide, owner and admin", async () => {
		for (const role of ["guide", "owner", "admin"]) {
			await expect(
				assertGuideAssignable(await ctx(), ORG_ID, "u1", asLookup(role)),
			).resolves.toBeUndefined();
		}
	});

	it("scopes the lookup to the caller's organization", async () => {
		// A member of a DIFFERENT org must not satisfy the check: this is the
		// whole point, so assert the lookup was given the caller's org id.
		const seen: string[] = [];
		await expect(
			assertGuideAssignable(await ctx(), "org_a", "u1", (_c, orgId) => {
				seen.push(orgId);
				return Promise.resolve({ userId: "u1", role: "guide" });
			}),
		).resolves.toBeUndefined();
		expect(seen).toEqual(["org_a"]);
	});
});

describe("guide membership at the public boundary (GT-AUDIT-02 / hub F594)", () => {
	// Real calls through the auth seam (vi.mock("../auth") above): the caller
	// is an admin of ORG; guide_in guides for ORG, guide_out for another org.
	// These replace source-text pins that read assignments.ts and searched for
	// the guard's call string.
	async function seeded(guideId = "guide_1") {
		const t = convexTest(schema, modules);
		signInAsAdmin();
		const ids = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const assignmentId = await seedAssignment(ctx, {
				orgId: ORG,
				tourId,
				guideId,
				status: "scheduled",
			});
			return { tourId, assignmentId };
		});
		const guideOf = async () =>
			(await t.run((ctx) => ctx.db.get(ids.assignmentId)))?.guideId;
		return { t, ...ids, guideOf };
	}

	it("update refuses a guide from another organization and writes nothing", async () => {
		const { t, assignmentId, guideOf } = await seeded();
		await expect(
			t.mutation(api.assignments.update, { assignmentId, guideId: "guide_out" }),
		).rejects.toThrow("Guide is not a member of this organization");
		expect(await guideOf()).toBe("guide_1");
	});

	it("update reassigns to a guide of the caller's own organization", async () => {
		const { t, assignmentId, guideOf } = await seeded();
		await t.mutation(api.assignments.update, { assignmentId, guideId: "guide_in" });
		expect(await guideOf()).toBe("guide_in");
	});

	it("update without a guideId does not re-check the stored guide", async () => {
		// The stored guide predates the check and is no longer a member; an
		// unrelated edit must not start failing because of it.
		const { t, assignmentId, guideOf } = await seeded("guide_legacy");
		await t.mutation(api.assignments.update, { assignmentId, clearVehicle: true });
		expect(await guideOf()).toBe("guide_legacy");
	});

	it("internalUpdate stays unguarded for session-less cron/ops callers", async () => {
		// Moving the check into the lifecycle mutation broke cron/ops paths
		// that run with no session; it belongs on the public wrapper only.
		const { t, assignmentId, guideOf } = await seeded();
		mockState.user = null;
		await t.mutation(internal.assignments.internalUpdate, {
			assignmentId,
			guideId: "guide_out",
			organizationId: ORG,
			userId: "system",
		});
		expect(await guideOf()).toBe("guide_out");
	});

	it("create refuses a guide from another organization", async () => {
		const { t, tourId } = await seeded();
		await expect(
			t.mutation(api.assignments.create, {
				tourId,
				guideId: "guide_out",
				date: "2026-07-16",
				startTime: "09:00",
			}),
		).rejects.toThrow("Guide is not a member of this organization");
		const created = await t.run((ctx) =>
			ctx.db
				.query("assignments")
				.filter((q) => q.eq(q.field("guideId"), "guide_out"))
				.collect(),
		);
		expect(created).toEqual([]);
	});
});

// ---- GT-AUDIT-06 / hub F604: the deletedAt guard reached only performUpdate ----
//
// performUpdate refuses a soft-deleted assignment ("Assignment is deleted"),
// but performCancel, performComplete and performRemove never read deletedAt.
// So cancelling an assignment already archived via remove patched status to
// "cancelled" and emailed the guide AND driver about a departure that no
// longer existed, and completing one wrote an assignment.completed audit row
// for a row every read path hides. The FE cannot reach these rows
// (assignments.list filters !deletedAt, assignments.get returns null) but the
// BE is reachable by any Convex client.

describe("lifecycle verbs — refuse a soft-deleted assignment", () => {
	// Each verb keeps its OWN args in a closure rather than sharing a
	// `{ run, args }` pair: GT-AUDIT-07 gave performComplete a callerRole the
	// other two do not take, and with a shared pair TypeScript unions the
	// `args` return types independently of `run`, so the call no longer
	// typechecks even though every entry is correct.
	type LifecycleCtx = Parameters<typeof performComplete>[0];
	const verbs = [
		{
			name: "performCancel",
			call: (ctx: LifecycleCtx, id: Id<"assignments">) =>
				performCancel(ctx, { assignmentId: id, organizationId: ORG, userId: "user_1" }),
		},
		{
			name: "performComplete",
			call: (ctx: LifecycleCtx, id: Id<"assignments">) =>
				performComplete(ctx, {
					assignmentId: id,
					organizationId: ORG,
					userId: "user_1",
					callerRole: "admin",
				}),
		},
		{
			name: "performRemove",
			call: (ctx: LifecycleCtx, id: Id<"assignments">) =>
				performRemove(ctx, { assignmentId: id, organizationId: ORG, userId: "user_1" }),
		},
	] as const;

	for (const verb of verbs) {
		it(`${verb.name} rejects with "Assignment is deleted" and writes nothing`, async () => {
			const t = convexTest(schema, modules);
			const { assignmentId } = await seedAssigned(t);
			const deletedAt = 1_700_000_000_000;
			await t.run(async (ctx) => {
				await ctx.db.patch(assignmentId, { deletedAt });
			});

			await t.run(async (ctx) => {
				await expect(verb.call(ctx, assignmentId)).rejects.toThrow(
					"Assignment is deleted",
				);
			});

			// Nothing may have been written: status untouched, deletedAt
			// unchanged, and no audit row for the verb.
			const after = await t.run(async (ctx) => {
				const row = await ctx.db.get(assignmentId);
				const audits = await ctx.db
					.query("auditLogs")
					.withIndex("by_resource", (q) =>
						q.eq("resourceType", "assignment").eq("resourceId", assignmentId),
					)
					.collect();
				return {
					status: row?.status,
					deletedAt: row?.deletedAt,
					auditActions: audits.map((a) => a.action),
				};
			});
			expect(after.status).toBe("scheduled");
			expect(after.deletedAt).toBe(deletedAt);
			expect(after.auditActions).not.toContain("assignment.cancelled");
			expect(after.auditActions).not.toContain("assignment.completed");
			expect(after.auditActions).not.toContain("assignment.soft_deleted");
		});
	}

	it("still operates normally on a live assignment", async () => {
		// The guard must not have broken the ordinary path.
		const t = convexTest(schema, modules);
		const { assignmentId } = await seedAssigned(t);
		await t.run(async (ctx) => {
			await performCancel(ctx, {
				assignmentId,
				organizationId: ORG,
				userId: "user_1",
			});
		});
		const after = await t.run(async (ctx) => (await ctx.db.get(assignmentId))?.status);
		expect(after).toBe("cancelled");
	});
});

// F460: the archived-assignment purge. Pins the retention contract:
// rows archived within the window survive, rows archived past the
// window are hard-deleted, never-archived rows are never touched, and
// the completed→cancelled chaining leaves nothing behind.
describe("purgeArchivedAssignments (F460 retention)", () => {
	it("hard-deletes rows archived past the window and spares the rest", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		const DAY = 24 * 60 * 60 * 1000;
		// The purge scans by departure date (by_status_date < cutoff) before
		// checking deletedAt, so every row here departs well before the
		// window — otherwise none is scanned and "spared" proves nothing.
		const oldDate = new Date(now - 500 * DAY).toISOString().slice(0, 10);
		await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const oldArchived = await seedAssignment(ctx, {
				orgId: ORG,
				tourId,
				guideId: "guide_1",
				status: "completed",
				date: oldDate,
			});
			await ctx.db.patch(oldArchived, {
				deletedAt: now - 400 * DAY,
				updatedAt: now - 400 * DAY,
			});
			const freshArchived = await seedAssignment(ctx, {
				orgId: ORG,
				tourId,
				guideId: "guide_2",
				status: "completed",
				date: oldDate,
			});
			await ctx.db.patch(freshArchived, {
				deletedAt: now - 10 * DAY,
				updatedAt: now - 10 * DAY,
			});
			const live = await seedAssignment(ctx, {
				orgId: ORG,
				tourId,
				guideId: "guide_3",
				status: "completed",
				date: oldDate,
			});
			await ctx.db.patch(live, { updatedAt: now });

			await ctx.runMutation(internal.notifications.purgeArchivedAssignments, {});

			// Past-window archived row: gone. (Awaited: the un-awaited form
			// rejected after the test had already passed.)
			await expect(ctx.db.get(oldArchived)).resolves.toBeNull();
			// Freshly archived row: survives (its purge date is next year).
			await ctx.db.get(freshArchived).then((row) => expect(row).not.toBeNull());
			// Never-archived row: never touched.
			await ctx.db.get(live).then((row) => expect(row).not.toBeNull());
		});
	});

	it("purges the cancelled pass too", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		const DAY = 24 * 60 * 60 * 1000;
		await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const oldCancelled = await seedAssignment(ctx, {
				orgId: ORG,
				tourId,
				guideId: "guide_1",
				status: "cancelled",
				date: new Date(now - 600 * DAY).toISOString().slice(0, 10),
			});
			await ctx.db.patch(oldCancelled, {
				deletedAt: now - 500 * DAY,
				updatedAt: now - 500 * DAY,
			});

			await ctx.runMutation(
				internal.notifications.purgeArchivedAssignments,
				{ status: "cancelled" },
			);

			await expect(ctx.db.get(oldCancelled)).resolves.toBeNull();
		});
	});
});
