import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";

type MockUser = { _id: string; name: string; email: string };
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

async function seedAvailability(
	ctx: any,
	orgId: string,
	userId: string,
	date: string,
	isAvailable: boolean,
) {
	return await ctx.db.insert("availabilities", {
		organizationId: orgId,
		userId,
		date,
		isAvailable,
		createdAt: 0,
	});
}

describe("availabilities", () => {
	it("upsert: creates a new availability row", async () => {
		const t = convexTest(schema, modules);
		const id = await t.mutation(internal.availabilities.internalUpsert, {
			organizationId: "org_av1",
			callerUserId: "admin-1",
			userIdTarget: "guide-1",
			date: "2026-08-01",
			isAvailable: false,
		});
		expect(id).toBeDefined();
		const a = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(a?.userId).toBe("guide-1");
		expect(a?.isAvailable).toBe(false);
		expect(a?.date).toBe("2026-08-01");
	});

	it("upsert: patches existing row for same user+date", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) =>
			seedAvailability(ctx, "org_av2", "guide-1", "2026-08-02", true),
		);
		await t.mutation(internal.availabilities.internalUpsert, {
			organizationId: "org_av2",
			callerUserId: "admin-1",
			userIdTarget: "guide-1",
			date: "2026-08-02",
			isAvailable: false,
		});
		const a = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(a?.isAvailable).toBe(false);
	});

	it("upsert: allows different users on same date", async () => {
		const t = convexTest(schema, modules);
		const id1 = await t.mutation(internal.availabilities.internalUpsert, {
			organizationId: "org_av3",
			callerUserId: "admin-1",
			userIdTarget: "guide-1",
			date: "2026-08-03",
			isAvailable: true,
		});
		const id2 = await t.mutation(internal.availabilities.internalUpsert, {
			organizationId: "org_av3",
			callerUserId: "admin-1",
			userIdTarget: "guide-2",
			date: "2026-08-03",
			isAvailable: false,
		});
		expect(id1).not.toBe(id2);
	});

	it("upsert: org-scoped lookup means a same-guideId in another org doesn't conflict", async () => {
		const t = convexTest(schema, modules);
		await t.run((ctx) =>
			seedAvailability(ctx, "org_av4a", "guide-1", "2026-08-04", true),
		);
		// Upserting for the same guideId+date but a DIFFERENT org must
		// succeed (org-scoped lookup doesn't see the other-org row) and
		// produce a brand-new availability row in the calling org.
		const newId = await t.mutation(internal.availabilities.internalUpsert, {
			organizationId: "org_av4b",
			callerUserId: "admin-1",
			userIdTarget: "guide-1",
			date: "2026-08-04",
			isAvailable: false,
		});
		const rows = (await t.run((ctx) => ctx.db.query("availabilities").collect())) as Array<{
			_id: string;
			organizationId: string;
			isAvailable: boolean;
		}>;
		expect(rows.length).toBe(2);
		const orgB = rows.find((r) => r.organizationId === "org_av4b");
		expect(orgB?._id).toBe(newId);
		expect(orgB?.isAvailable).toBe(false);
		// Original org_av4a row is untouched.
		const orgA = rows.find((r) => r.organizationId === "org_av4a");
		expect(orgA?.isAvailable).toBe(true);
	});

	it("remove: deletes availability row", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) =>
			seedAvailability(ctx, "org_av5", "guide-1", "2026-08-05", true),
		);
		await t.mutation(internal.availabilities.internalRemove, {
			organizationId: "org_av5",
			userId: "admin-1",
			availabilityId: id,
		});
		const a = await t.run((ctx) => ctx.db.get(id));
		expect(a).toBeNull();
	});

	it("remove: rejects wrong organization", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) =>
			seedAvailability(ctx, "org_av6a", "guide-1", "2026-08-06", true),
		);
		await expect(
			t.mutation(internal.availabilities.internalRemove, {
				organizationId: "org_av6b",
				userId: "admin-1",
				availabilityId: id,
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("remove: rejects missing availability", async () => {
		const t = convexTest(schema, modules);
		// Insert a row to get a valid Id format
		const id = await t.run((ctx) =>
			seedAvailability(ctx, "org_av7", "guide-1", "2026-08-07", true),
		);
		await t.run((ctx) => ctx.db.delete(id));
		await expect(
			t.mutation(internal.availabilities.internalRemove, {
				organizationId: "org_av7",
				userId: "admin-1",
				availabilityId: id,
			}),
		).rejects.toThrow(/not found/);
	});
});

describe("availabilities.remove — public authz", () => {
	const ORG: MockOrg = {
		id: "org_av_pub",
		name: "Avail Org",
		slug: "avail-org",
		createdAt: 1,
		members: [
			{ userId: "u_owner", role: "owner" },
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

	it("guide cannot delete another user's availability (same org)", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) =>
			seedAvailability(ctx, ORG.id, "u_guide", "2026-08-10", true),
		);
		signIn("u_member");
		await expect(
			t.mutation(api.availabilities.remove, { availabilityId: id }),
		).rejects.toThrow(/Forbidden/);
		// Victim row survives.
		const row = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(row?.isAvailable).toBe(true);
	});

	it("owner can delete another member's availability", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) =>
			seedAvailability(ctx, ORG.id, "u_guide", "2026-08-11", true),
		);
		signIn("u_owner");
		await t.mutation(api.availabilities.remove, { availabilityId: id });
		expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
	});
});
