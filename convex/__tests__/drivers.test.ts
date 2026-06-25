import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function seedDriver(
	ctx: any,
	orgId: string,
	overrides: Record<string, any> = {},
) {
	return await ctx.db.insert("drivers", {
		organizationId: orgId,
		userId: "driver-1",
		licenseInfo: "license-1",
		availability: {},
		notes: "",
		isActive: true,
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	});
}

describe("drivers", () => {
	it("create: stores driver and writes audit log", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_d1";
		const id = await t.mutation(internal.drivers.internalCreate, {
			organizationId: orgId,
			createdByUserId: "user-1",
			userId: "driver-1",
			licenseInfo: "license-1",
		});
		expect(id).toBeDefined();
		const logs = (await t.run((ctx) =>
			ctx.db.query("auditLogs").collect(),
		)) as any;
		expect(logs.length).toBe(1);
		expect(logs[0]?.action).toBe("driver.created");
	});

	it("create: rejects duplicate driver profile for same user", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_d2";
		await t.mutation(internal.drivers.internalCreate, {
			organizationId: orgId,
			createdByUserId: "user-1",
			userId: "driver-dup",
			licenseInfo: "lic1",
		});
		await expect(
			t.mutation(internal.drivers.internalCreate, {
				organizationId: orgId,
				createdByUserId: "user-1",
				userId: "driver-dup",
				licenseInfo: "lic1",
			}),
		).rejects.toThrow(/already exists/);
	});

	it("create: allows same userId in different org", async () => {
		const t = convexTest(schema, modules);
		const id1 = await t.mutation(internal.drivers.internalCreate, {
			organizationId: "org_d3a",
			createdByUserId: "user-1",
			userId: "shared-user",
			licenseInfo: "lic1",
		});
		const id2 = await t.mutation(internal.drivers.internalCreate, {
			organizationId: "org_d3b",
			createdByUserId: "user-2",
			userId: "shared-user",
			licenseInfo: "lic1",
		});
		expect(id1).not.toBe(id2);
	});

	it("update: patches allowed fields", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_d4";
		const id = await t.run((ctx) => seedDriver(ctx, orgId));
		await t.mutation(internal.drivers.internalUpdate, {
			organizationId: orgId,
			userId: "user-1",
			driverId: id,
			licenseInfo: "updated-lic",
			isActive: false,
		});
		const d = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(d?.licenseInfo).toBe("updated-lic");
		expect(d?.isActive).toBe(false);
	});

	it("update: rejects wrong organization", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) =>
			seedDriver(ctx, "org_d5a"),
		);
		await expect(
			t.mutation(internal.drivers.internalUpdate, {
				organizationId: "org_d5b",
				userId: "user-1",
				driverId: id,
				licenseInfo: "hack",
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("setActive: toggles isActive", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_d6";
		const id = await t.run((ctx) => seedDriver(ctx, orgId));
		await t.mutation(internal.drivers.internalSetActive, {
			organizationId: orgId,
			userId: "user-1",
			driverId: id,
			isActive: false,
		});
		const d = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(d?.isActive).toBe(false);
	});

	it("remove: deletes driver and writes audit log", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_d7";
		const id = await t.run((ctx) => seedDriver(ctx, orgId));
		await t.mutation(internal.drivers.internalRemove, {
			organizationId: orgId,
			userId: "user-1",
			driverId: id,
		});
		const d = await t.run((ctx) => ctx.db.get(id));
		expect(d).toBeNull();
		const logs = (await t.run((ctx) =>
			ctx.db.query("auditLogs").collect(),
		)) as any;
		expect(logs.some((l: any) => l.action === "driver.deleted")).toBe(true);
	});
});
