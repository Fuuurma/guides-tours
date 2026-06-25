import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function seedTour(ctx: any, orgId: string) {
	return await ctx.db.insert("tours", {
		organizationId: orgId,
		name: "T",
		description: "",
		durationHours: 2,
		isActive: true,
		recurrenceType: "none",
		recurrenceDaysOfWeek: [],
		capacity: 10,
		bufferMinutes: 15,
		minGuests: 1,
		maxGuests: 10,
		bookingCutoffHours: 24,
		tourType: "walking",
		languages: ["en"],
		requiredGuides: 1,
		inclusions: [],
		exclusions: [],
		highlights: [],
		currency: "USD",
		createdAt: 0,
		updatedAt: 0,
	});
}

async function seedIntegration(ctx: any, orgId: string) {
	return await ctx.db.insert("otaIntegrations", {
		organizationId: orgId,
		provider: "viator",
		apiKey: "encrypted-blob",
		isActive: true,
		isSandbox: true,
		autoSyncAvailability: false,
		autoSyncPricing: false,
		syncIntervalMinutes: 60,
		settings: {},
		createdAt: 0,
		updatedAt: 0,
	});
}

describe("OTA products", () => {
	it("create: stores product linking tour to integration", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_op1";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId),
		);
		const id = await t.mutation(internal.otaProducts.internalCreate, {
			organizationId: orgId,
			tourId,
			integrationId,
			otaProductId: "VR-100",
			commissionRate: 0.2,
		});
		expect(id).toBeDefined();
		const row = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(row?.syncStatus).toBe("PENDING");
		expect(row?.otaCurrency).toBe("USD");
	});

	it("create: rejects commissionRate out of range", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_op2";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId),
		);
		await expect(
			t.mutation(internal.otaProducts.internalCreate, {
				organizationId: orgId,
				tourId,
				integrationId,
				otaProductId: "VR-101",
				commissionRate: 1.5,
			}),
		).rejects.toThrow(/0\.\.1/);
	});

	it("create: rejects cross-org tour", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run((ctx) => seedTour(ctx, "org_op3a"));
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, "org_op3b"),
		);
		await expect(
			t.mutation(internal.otaProducts.internalCreate, {
				organizationId: "org_op3b",
				tourId,
				integrationId,
				otaProductId: "VR-102",
				commissionRate: 0.2,
			}),
		).rejects.toThrow(/tour belongs to a different organization/);
	});

	it("create: rejects cross-org integration", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run((ctx) => seedTour(ctx, "org_op4a"));
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, "org_op4b"),
		);
		await expect(
			t.mutation(internal.otaProducts.internalCreate, {
				organizationId: "org_op4a",
				tourId,
				integrationId,
				otaProductId: "VR-103",
				commissionRate: 0.2,
			}),
		).rejects.toThrow(/integration belongs to a different organization/);
	});

	it("update: patches fields", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_op5";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId),
		);
		const id = await t.mutation(internal.otaProducts.internalCreate, {
			organizationId: orgId,
			tourId,
			integrationId,
			otaProductId: "VR-104",
			commissionRate: 0.2,
		});
		await t.mutation(internal.otaProducts.internalUpdate, {
			organizationId: orgId,
			productId: id,
			syncStatus: "SYNCED",
			otaTitle: "Listed title",
		});
		const row = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(row?.syncStatus).toBe("SYNCED");
		expect(row?.otaTitle).toBe("Listed title");
	});

	it("update: rejects wrong organization", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_op6a";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId),
		);
		const id = await t.mutation(internal.otaProducts.internalCreate, {
			organizationId: orgId,
			tourId,
			integrationId,
			otaProductId: "VR-105",
			commissionRate: 0.2,
		});
		await expect(
			t.mutation(internal.otaProducts.internalUpdate, {
				organizationId: "org_op6b",
				productId: id,
				syncStatus: "DISABLED",
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("remove: deletes product", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_op7";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId),
		);
		const id = await t.mutation(internal.otaProducts.internalCreate, {
			organizationId: orgId,
			tourId,
			integrationId,
			otaProductId: "VR-106",
			commissionRate: 0.2,
		});
		await t.mutation(internal.otaProducts.internalRemove, {
			organizationId: orgId,
			productId: id,
		});
		const row = await t.run((ctx) => ctx.db.get(id));
		expect(row).toBeNull();
	});
});