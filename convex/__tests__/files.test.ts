import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

describe("files", () => {
	it("track: stores file metadata", async () => {
		const t = convexTest(schema, modules);
		const storageId = (await t.run(async (ctx) =>
			(await ctx.storage.store(new Blob(["x"]))) as unknown as string,
		)) as never;
		const id = await t.mutation(internal.files.internalTrack, {
			organizationId: "org_f1",
			uploadedBy: "user-1",
			storageId,
			filename: "test.png",
			contentType: "image/png",
			size: 1024,
			purpose: "tour-image",
		});
		expect(id).toBeDefined();
		const row = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(row?.filename).toBe("test.png");
		expect(row?.purpose).toBe("tour-image");
	});

	it("track: rejects negative size", async () => {
		const t = convexTest(schema, modules);
		const storageId = (await t.run(async (ctx) =>
			(await ctx.storage.store(new Blob(["x"]))) as unknown as string,
		)) as never;
		await expect(
			t.mutation(internal.files.internalTrack, {
				organizationId: "org_f2",
				uploadedBy: "user-1",
				storageId,
				filename: "test.png",
				contentType: "image/png",
				size: -1,
				purpose: "tour-image",
			}),
		).rejects.toThrow(/non-negative/);
	});

	it("remove: deletes file record + storage blob", async () => {
		const t = convexTest(schema, modules);
		const storageId = (await t.run(async (ctx) =>
			(await ctx.storage.store(new Blob(["x"]))) as unknown as string,
		)) as never;
		const id = await t.mutation(internal.files.internalTrack, {
			organizationId: "org_f3",
			uploadedBy: "user-1",
			storageId,
			filename: "test.png",
			contentType: "image/png",
			size: 1024,
			purpose: "tour-image",
		});
		await t.mutation(internal.files.internalRemove, {
			organizationId: "org_f3",
			userId: "user-1",
			fileId: id,
		});
		const row = await t.run((ctx) => ctx.db.get(id));
		expect(row).toBeNull();
	});

	it("remove: rejects wrong organization", async () => {
		const t = convexTest(schema, modules);
		const storageId = (await t.run(async (ctx) =>
			(await ctx.storage.store(new Blob(["x"]))) as unknown as string,
		)) as never;
		const id = await t.mutation(internal.files.internalTrack, {
			organizationId: "org_f4",
			uploadedBy: "user-1",
			storageId,
			filename: "test.png",
			contentType: "image/png",
			size: 1024,
			purpose: "tour-image",
		});
		await expect(
			t.mutation(internal.files.internalRemove, {
				organizationId: "org_f4-other",
				userId: "user-1",
				fileId: id,
			}),
		).rejects.toThrow(/Forbidden/);
	});
});