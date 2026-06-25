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

describe("tour images", () => {
	it("add: stores image record (storage stub)", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ti1";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		// We don't have real storage in tests; create a fake storage id by
		// inserting into the _storage system table.
		const storageId = await t.run(async (ctx) =>
			(await ctx.storage.store(
				new Blob(["fake image bytes"]),
			)) as unknown as string,
		);
		const id = await t.mutation(internal.tourImages.internalAdd, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			storageId: storageId as never,
			altText: "Front of cathedral",
			isPrimary: true,
		});
		expect(id).toBeDefined();
		const img = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(img?.altText).toBe("Front of cathedral");
		expect(img?.isPrimary).toBe(true);
	});

	it("add: rejects cross-org tour", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run((ctx) => seedTour(ctx, "org_ti2a"));
		const storageId = await t.run(async (ctx) =>
			(await ctx.storage.store(
				new Blob(["x"], ),
			)) as unknown as string,
		);
		await expect(
			t.mutation(internal.tourImages.internalAdd, {
				organizationId: "org_ti2b",
				userId: "user-1",
				tourId,
				storageId: storageId as never,
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("add: demotes previous primary when adding a new one", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ti3";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const s1 = await t.run(async (ctx) =>
			(await ctx.storage.store(new Blob(["a"]), )) as unknown as string,
		);
		const s2 = await t.run(async (ctx) =>
			(await ctx.storage.store(new Blob(["b"]), )) as unknown as string,
		);
		const id1 = await t.mutation(internal.tourImages.internalAdd, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			storageId: s1 as never,
			isPrimary: true,
		});
		await t.mutation(internal.tourImages.internalAdd, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			storageId: s2 as never,
			isPrimary: true,
		});
		const all = (await t.run((ctx) =>
			ctx.db
				.query("tourImages")
				.withIndex("by_tour", (q) => q.eq("tourId", tourId))
				.collect(),
		)) as any;
		const primaries = all.filter((img: any) => img.isPrimary);
		expect(primaries.length).toBe(1);
		expect(primaries[0]._id).not.toBe(id1);
	});

	it("update: patches alt text and display order", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ti4";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const s = await t.run(async (ctx) =>
			(await ctx.storage.store(new Blob(["x"]), )) as unknown as string,
		);
		const id = await t.mutation(internal.tourImages.internalAdd, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			storageId: s as never,
			altText: "old",
			displayOrder: 5,
		});
		await t.mutation(internal.tourImages.internalUpdate, {
			organizationId: orgId,
			userId: "user-1",
			imageId: id,
			altText: "new",
			displayOrder: 1,
		});
		const img = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(img?.altText).toBe("new");
		expect(img?.displayOrder).toBe(1);
	});

	it("update: rejects wrong organization", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ti5a";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const s = await t.run(async (ctx) =>
			(await ctx.storage.store(new Blob(["x"]), )) as unknown as string,
		);
		const id = await t.mutation(internal.tourImages.internalAdd, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			storageId: s as never,
		});
		await expect(
			t.mutation(internal.tourImages.internalUpdate, {
				organizationId: "org_ti5b",
				userId: "user-1",
				imageId: id,
				altText: "hack",
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("remove: deletes image record", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ti6";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const s = await t.run(async (ctx) =>
			(await ctx.storage.store(new Blob(["x"]), )) as unknown as string,
		);
		const id = await t.mutation(internal.tourImages.internalAdd, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			storageId: s as never,
		});
		await t.mutation(internal.tourImages.internalRemove, {
			organizationId: orgId,
			userId: "user-1",
			imageId: id,
		});
		const img = await t.run((ctx) => ctx.db.get(id));
		expect(img).toBeNull();
	});
});
