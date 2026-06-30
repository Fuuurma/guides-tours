import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function seedVehicle(
	ctx: any,
	orgId: string,
	overrides: Record<string, any> = {},
) {
	return await ctx.db.insert("vehicles", {
		organizationId: orgId,
		name: "Van A",
		vehicleType: "van",
		capacity: 8,
		licensePlate: "ABC-123",
		make: "Ford",
		model: "Transit",
		color: "white",
		ownershipType: "owned",
		status: "available",
		notes: "",
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	});
}

describe("vehicles", () => {
	it("create: stores vehicle and writes audit log", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v1";
		const id = await t.mutation(internal.vehicles.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			name: "Van A",
			vehicleType: "van",
			capacity: 8,
		});
		expect(id).toBeDefined();
		const logs = (await t.run((ctx) =>
			ctx.db.query("auditLogs").collect(),
		)) as any;
		expect(logs.length).toBe(1);
		expect(logs[0]?.action).toBe("vehicle.created");
	});

	it("create: rejects capacity <= 0", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(internal.vehicles.internalCreate, {
				organizationId: "org_v2",
				userId: "user-1",
				name: "Bad Van",
				vehicleType: "van",
				capacity: 0,
			}),
		).rejects.toThrow(/Capacity must be positive/);
	});

	it("update: patches allowed fields only", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v3";
		const id = await t.run((ctx) => seedVehicle(ctx, orgId));
		await t.mutation(internal.vehicles.internalUpdate, {
			organizationId: orgId,
			userId: "user-1",
			vehicleId: id,
			name: "Renamed Van",
			capacity: 12,
		});
		const v = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(v?.name).toBe("Renamed Van");
		expect(v?.capacity).toBe(12);
		expect(v?.status).toBe("available");
	});

	it("update: rejects wrong organization", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) =>
			seedVehicle(ctx, "org_v4a"),
		);
		await expect(
			t.mutation(internal.vehicles.internalUpdate, {
				organizationId: "org_v4b",
				userId: "user-1",
				vehicleId: id,
				name: "Hacked",
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("setStatus: transitions status", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v5";
		const id = await t.run((ctx) => seedVehicle(ctx, orgId));
		await t.mutation(internal.vehicles.internalSetStatus, {
			organizationId: orgId,
			userId: "user-1",
			vehicleId: id,
			status: "maintenance",
		});
		const v = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(v?.status).toBe("maintenance");
	});

	it("remove: deletes vehicle and writes audit log", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v6";
		const id = await t.run((ctx) => seedVehicle(ctx, orgId));
		await t.mutation(internal.vehicles.internalRemove, {
			organizationId: orgId,
			userId: "user-1",
			vehicleId: id,
		});
		const v = await t.run((ctx) => ctx.db.get(id));
		expect(v).toBeNull();
		const logs = (await t.run((ctx) =>
			ctx.db.query("auditLogs").collect(),
		)) as any;
		expect(logs.some((l: any) => l.action === "vehicle.deleted")).toBe(true);
	});

	it("remove: rejects wrong organization", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) =>
			seedVehicle(ctx, "org_v7a"),
		);
		await expect(
			t.mutation(internal.vehicles.internalRemove, {
				organizationId: "org_v7b",
				userId: "user-1",
				vehicleId: id,
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("create: rejects name over MAX_VEHICLE_NAME_LEN", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(internal.vehicles.internalCreate, {
				organizationId: "org_v_long",
				userId: "user-1",
				name: "V".repeat(101),
				vehicleType: "van",
				capacity: 8,
			}),
		).rejects.toThrow(/name is too long/);
	});

	it("create: rejects vehicleType over MAX_SHORT_FIELD_LEN", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(internal.vehicles.internalCreate, {
				organizationId: "org_v_tlong",
				userId: "user-1",
				name: "Van",
				vehicleType: "T".repeat(51),
				capacity: 8,
			}),
		).rejects.toThrow(/vehicleType is too long/);
	});

	it("create: rejects licensePlate over MAX_LICENSE_LEN", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(internal.vehicles.internalCreate, {
				organizationId: "org_v_plong",
				userId: "user-1",
				name: "Van",
				vehicleType: "van",
				capacity: 8,
				licensePlate: "P".repeat(201),
			}),
		).rejects.toThrow(/licensePlate is too long/);
	});

	it("update: rejects name over MAX_VEHICLE_NAME_LEN", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v_ulong";
		const id = await t.run((ctx) => seedVehicle(ctx, orgId));
		await expect(
			t.mutation(internal.vehicles.internalUpdate, {
				organizationId: orgId,
				userId: "user-1",
				vehicleId: id,
				name: "V".repeat(101),
			}),
		).rejects.toThrow(/name is too long/);
	});

	it("update: rejects notes over MAX_NOTES_LEN", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_v_unlong";
		const id = await t.run((ctx) => seedVehicle(ctx, orgId));
		await expect(
			t.mutation(internal.vehicles.internalUpdate, {
				organizationId: orgId,
				userId: "user-1",
				vehicleId: id,
				notes: "N".repeat(1001),
			}),
		).rejects.toThrow(/notes is too long/);
	});
});
