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

	it("list: caps at the 500 NEWEST files, not the oldest", async () => {
		// Regression pin for F57: by_org/by_org_purpose carry no time
		// field, so take(500) returned the 500 oldest rows and the JS
		// sort only reordered that stale window — the newest upload was
		// permanently invisible. by_org_created orders at index level.
		const t = convexTest(schema, modules);
		const storageId = (await t.run(async (ctx) =>
			(await ctx.storage.store(new Blob(["x"]))) as unknown as string,
		)) as never;
		await t.run(async (ctx) => {
			for (let i = 0; i < 550; i++) {
				await ctx.db.insert("files", {
					organizationId: "org_f5",
					storageId,
					filename: `f${String(i).padStart(3, "0")}.png`,
					contentType: "image/png",
					size: 1024,
					purpose: "tour-image",
					uploadedBy: "user-1",
					createdAt: i,
				});
			}
		});

		const result = await t.query(internal.files.listInternal, {
			organizationId: "org_f5",
		});
		expect(result.items.length).toBe(500);
		expect(result.truncated).toBe(true);
		expect(result.items[0]!.filename).toBe("f549.png");
		expect(
			result.items.some((f: any) => f.filename === "f549.png"),
		).toBe(true);
		expect(
			result.items.some((f: any) => f.filename === "f000.png"),
		).toBe(false);
	});

	it("list: purpose filter also caps at newest rows", async () => {
		const t = convexTest(schema, modules);
		const storageId = (await t.run(async (ctx) =>
			(await ctx.storage.store(new Blob(["x"]))) as unknown as string,
		)) as never;
		await t.run(async (ctx) => {
			for (let i = 0; i < 510; i++) {
				await ctx.db.insert("files", {
					organizationId: "org_f6",
					storageId,
					filename: `doc${String(i).padStart(3, "0")}.pdf`,
					contentType: "application/pdf",
					size: 2048,
					purpose: "customer-doc",
					uploadedBy: "user-1",
					createdAt: i,
				});
			}
			await ctx.db.insert("files", {
				organizationId: "org_f6",
				storageId,
				filename: "img0.png",
				contentType: "image/png",
				size: 1024,
				purpose: "tour-image",
				uploadedBy: "user-1",
				createdAt: 9999,
			});
		});

		const docs = await t.query(internal.files.listInternal, {
			organizationId: "org_f6",
			purpose: "customer-doc",
		});
		expect(docs.items.length).toBe(500);
		expect(docs.truncated).toBe(true);
		expect(docs.items[0]!.filename).toBe("doc509.pdf");
		expect(docs.items.every((f: any) => f.purpose === "customer-doc")).toBe(
			true,
		);
	});
});