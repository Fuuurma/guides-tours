import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { internal, api } from "../_generated/api";
import { calculateVacationDays } from "../vacationRequests";

type MockUser = {
	_id: string;
	name: string;
	email: string;
};

type MockMember = { userId: string; role: string };

type MockOrg = {
	id: string;
	name: string;
	slug: string;
	createdAt: number;
	members: MockMember[];
};

const { mockState } = vi.hoisted(() => ({
	mockState: {
		user: null as MockUser | null,
		session: null as { activeOrganizationId?: string | null } | null,
		orgs: [] as MockOrg[],
	},
}));

vi.mock("../auth", () => ({
	authComponent: {
		getAuthUser: async () => mockState.user,
		safeGetAuthUser: async () => mockState.user ?? undefined,
		getAuth: async () => ({
			auth: {
				api: {
					getSession: async () =>
						mockState.session
							? { session: mockState.session, user: mockState.user }
							: null,
					getFullOrganization: async (args: {
						query: { organizationId: string };
					}) =>
						mockState.orgs.find((o) => o.id === args.query.organizationId) ??
						null,
					listOrganizations: async () => mockState.orgs,
					listMembers: async (args: {
						query: { organizationId: string };
					}) => ({
						members:
							mockState.orgs.find((o) => o.id === args.query.organizationId)
								?.members ?? [],
					}),
				},
			},
			headers: new Headers(),
		}),
	},
	createAuth: (() => ({})) as never,
}));

const modules = import.meta.glob("../**/*.{ts,tsx}");

beforeEach(() => {
	mockState.user = null;
	mockState.session = null;
	mockState.orgs = [];
});

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
		).rejects.toThrow(/endDate must be on or after startDate/);
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
		const stats = await t.query(
			internal.vacationRequests.internalGetStats,
			{
				userId,
				organizationId: orgId,
				year: 2026,
			},
		);
		expect(stats.usedDays).toBe(10);
		expect(stats.remainingDays).toBe(10);
		expect(stats.pendingCount).toBe(1);
		expect(stats.totalDays).toBe(20);
	});

	it("getStats (public): rejects unauthenticated callers", async () => {
		// convexTest doesn't fake Better Auth (Phase 4 mocking deferred
		// per customers.test.ts header), so we can only verify the
		// unauthenticated branch. The data path is covered by the
		// internalGetStats test above.
		const t = convexTest(schema, modules);
		await expect(
			t.query(api.vacationRequests.getStats, { year: 2026 }),
		).rejects.toThrow(/Unauth/i);
	});
});

describe("vacationRequests — length validation", () => {
	it("internalCreate rejects reason over MAX_NOTES_LEN", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(internal.vacationRequests.internalCreate, {
				organizationId: "org_vac_len",
				userId: "user-1",
				startDate: "2026-08-01",
				endDate: "2026-08-05",
				reason: "r".repeat(1001),
			}),
		).rejects.toThrow(/Reason is too long/);
	});

	it("internalApprove rejects reason over MAX_NOTES_LEN", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_vac_approve_len";
		const requestId = await t.run(async (ctx) =>
			ctx.db.insert("vacationRequests", {
				organizationId: orgId,
				userId: "guide-1",
				startDate: "2026-08-01",
				endDate: "2026-08-05",
				reason: "",
				status: "pending",
				createdAt: 0,
				updatedAt: 0,
			}),
		);

		await expect(
			t.mutation(internal.vacationRequests.internalApprove, {
				organizationId: orgId,
				userId: "admin-1",
				requestId,
				reason: "r".repeat(1001),
			}),
		).rejects.toThrow(/Reason is too long/);
	});

	it("internalCreate accepts reason at exactly MAX_NOTES_LEN (boundary)", async () => {
		const t = convexTest(schema, modules);
		const id = await t.mutation(internal.vacationRequests.internalCreate, {
			organizationId: "org_vac_max",
			userId: "user-1",
			startDate: "2026-08-01",
			endDate: "2026-08-05",
			reason: "r".repeat(1000),
		});
		expect(id).toBeDefined();
	});

	it("internalCreate accepts empty/undefined reason", async () => {
		const t = convexTest(schema, modules);
		const id1 = await t.mutation(internal.vacationRequests.internalCreate, {
			organizationId: "org_vac_empty",
			userId: "user-1",
			startDate: "2026-09-01",
			endDate: "2026-09-02",
		});
		expect(id1).toBeDefined();
		const id2 = await t.mutation(internal.vacationRequests.internalCreate, {
			organizationId: "org_vac_empty",
			userId: "user-1",
			startDate: "2026-09-03",
			endDate: "2026-09-04",
			reason: "",
		});
		expect(id2).toBeDefined();
	});
});

describe("vacationRequests — approved on behalf", () => {
	it("internalCreate persists approved status and reviewer", async () => {
		const t = convexTest(schema, modules);
		const id = await t.mutation(internal.vacationRequests.internalCreate, {
			organizationId: "org_vac_approved",
			userId: "guide-1",
			startDate: "2026-10-01",
			endDate: "2026-10-05",
			reason: "Family trip",
			status: "approved",
			reviewedBy: "admin-1",
		});
		const vr = await t.run(async (ctx) => ctx.db.get(id));
		expect(vr?.status).toBe("approved");
		expect(vr?.reviewedBy).toBe("admin-1");
		expect(vr?.reviewedAt).toBeDefined();
	});

	it("internalCreate overlap still rejects an approved request", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_vac_overlap_approved";
		await t.mutation(internal.vacationRequests.internalCreate, {
			organizationId: orgId,
			userId: "guide-1",
			startDate: "2026-10-01",
			endDate: "2026-10-05",
			status: "approved",
			reviewedBy: "admin-1",
		});
		await expect(
			t.mutation(internal.vacationRequests.internalCreate, {
				organizationId: orgId,
				userId: "guide-1",
				startDate: "2026-10-04",
				endDate: "2026-10-08",
			}),
		).rejects.toThrow(/overlaps/);
	});

	it("internalCreate audit log omits reason", async () => {
		const t = convexTest(schema, modules);
		const id = await t.mutation(internal.vacationRequests.internalCreate, {
			organizationId: "org_vac_audit",
			userId: "guide-1",
			startDate: "2026-11-01",
			endDate: "2026-11-03",
			reason: "secret family matter",
			status: "approved",
			reviewedBy: "admin-1",
		});
		const logs = await t.run(async (ctx) =>
			ctx.db
				.query("auditLogs")
				.filter((q) => q.eq(q.field("resourceId"), id))
				.collect(),
		);
		expect(logs).toHaveLength(1);
		expect(logs[0]?.newValues).toMatchObject({
			startDate: "2026-11-01",
			endDate: "2026-11-03",
			status: "approved",
			onBehalf: true,
		});
		expect(logs[0]?.newValues).not.toHaveProperty("reason");
	});
});

describe("vacationRequests.create — on behalf of staff", () => {
	const ORG: MockOrg = {
		id: "org_vac_public",
		name: "Vac Org",
		slug: "vac-org",
		createdAt: 1,
		members: [
			{ userId: "u_owner", role: "owner" },
			{ userId: "u_admin", role: "admin" },
			{ userId: "u_member", role: "member" },
			{ userId: "u_guide", role: "guide" },
		],
	};

	function signIn(userId: string) {
		const member = ORG.members.find((m) => m.userId === userId);
		if (!member) throw new Error("unknown user");
		mockState.user = {
			_id: userId,
			name: userId,
			email: `${userId}@example.com`,
		};
		mockState.session = { activeOrganizationId: ORG.id };
		mockState.orgs = [ORG];
	}

	it("owner filing for another member stores an approved request", async () => {
		const t = convexTest(schema, modules);
		signIn("u_owner");
		const id = await t.mutation(api.vacationRequests.create, {
			startDate: "2026-12-01",
			endDate: "2026-12-03",
			reason: "guide PTO",
			userId: "u_guide",
		});
		const vr = (await t.run(async (ctx) => ctx.db.get(id))) as {
			userId: string;
			status: string;
			reviewedBy?: string;
		} | null;
		expect(vr?.userId).toBe("u_guide");
		expect(vr?.status).toBe("approved");
		expect(vr?.reviewedBy).toBe("u_owner");
	});

	it("self-request stays pending even when userId is the caller", async () => {
		const t = convexTest(schema, modules);
		signIn("u_owner");
		const id = await t.mutation(api.vacationRequests.create, {
			startDate: "2026-12-10",
			endDate: "2026-12-12",
			userId: "u_owner",
		});
		const vr = (await t.run(async (ctx) => ctx.db.get(id))) as {
			status: string;
			reviewedBy?: string;
		} | null;
		expect(vr?.status).toBe("pending");
		expect(vr?.reviewedBy).toBeUndefined();
	});

	it("member cannot file for another person", async () => {
		const t = convexTest(schema, modules);
		signIn("u_member");
		await expect(
			t.mutation(api.vacationRequests.create, {
				startDate: "2026-12-01",
				endDate: "2026-12-03",
				userId: "u_guide",
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("rejects a userId that is not in the org", async () => {
		const t = convexTest(schema, modules);
		signIn("u_owner");
		await expect(
			t.mutation(api.vacationRequests.create, {
				startDate: "2026-12-01",
				endDate: "2026-12-03",
				userId: "u_stranger",
			}),
		).rejects.toThrow(/not a member/);
	});
});

