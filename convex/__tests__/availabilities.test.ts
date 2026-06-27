import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

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
