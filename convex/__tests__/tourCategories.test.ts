import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function seedCategory(
	ctx: any,
	orgId: string,
	slug: string,
	overrides: Record<string, any> = {},
) {
	return await ctx.db.insert("tourCategories", {
		organizationId: orgId,
		name: overrides.name ?? slug,
		slug,
		description: "",
		icon: "",
		color: "",
		displayOrder: 0,
		isActive: true,
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	});
}

describe("tour categories", () => {
	it("create: stores category with audit log", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_c1";
		const id = await t.mutation(internal.tourCategories.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			name: "Food Tours",
			slug: "food-tours",
		});
		expect(id).toBeDefined();
		const logs = (await t.run((ctx) => ctx.db.query("auditLogs").collect())) as any;
		expect(logs[0]?.action).toBe("tour_category.created");
	});

	it("create: rejects duplicate slug in same org", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_c2";
		await t.mutation(internal.tourCategories.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			name: "Food",
			slug: "food",
		});
		await expect(
			t.mutation(internal.tourCategories.internalCreate, {
				organizationId: orgId,
				userId: "user-1",
				name: "Food 2",
				slug: "food",
			}),
		).rejects.toThrow(/already exists/);
	});

	it("create: allows same slug in different org", async () => {
		const t = convexTest(schema, modules);
		const id1 = await t.mutation(internal.tourCategories.internalCreate, {
			organizationId: "org_c3a",
			userId: "user-1",
			name: "Food",
			slug: "food",
		});
		const id2 = await t.mutation(internal.tourCategories.internalCreate, {
			organizationId: "org_c3b",
			userId: "user-2",
			name: "Food",
			slug: "food",
		});
		expect(id1).not.toBe(id2);
	});

	it("update: patches fields", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_c4";
		const id = await t.run((ctx) => seedCategory(ctx, orgId, "history"));
		await t.mutation(internal.tourCategories.internalUpdate, {
			organizationId: orgId,
			userId: "user-1",
			categoryId: id,
			name: "Historical Walks",
			isActive: false,
		});
		const c = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(c?.name).toBe("Historical Walks");
		expect(c?.isActive).toBe(false);
	});

	it("update: rejects wrong organization", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) => seedCategory(ctx, "org_c5a", "a"));
		await expect(
			t.mutation(internal.tourCategories.internalUpdate, {
				organizationId: "org_c5b",
				userId: "user-1",
				categoryId: id,
				name: "hack",
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("remove: deletes category and writes audit log", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_c6";
		const id = await t.run((ctx) => seedCategory(ctx, orgId, "del"));
		await t.mutation(internal.tourCategories.internalRemove, {
			organizationId: orgId,
			userId: "user-1",
			categoryId: id,
		});
		const c = await t.run((ctx) => ctx.db.get(id));
		expect(c).toBeNull();
		const logs = (await t.run((ctx) =>
			ctx.db.query("auditLogs").collect(),
		)) as any;
		expect(logs.some((l: any) => l.action === "tour_category.deleted")).toBe(true);
	});
});
