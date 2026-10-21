// F846 regression — the gallery upload PUTs the blob to storage before
// calling `add`, so every rejected add (200-image cap, missing tour,
// permission) used to leave a live, unreferenced blob. A failed
// mutation rolls its own storage writes back, so `add` cannot clean up
// after itself; the client calls `discard` from its catch instead.
//
// `discard` is member-gated and deletes the blob only when no
// tourImages or files row references it — safe against retries and
// double-submits that share the storageId.
//
// Auth seam: same vi.mock("../auth") pattern as
// files_remove_gate.test.ts — authComponent is stubbed so
// requireMembership resolves against controlled member roles.

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

type MockUser = { _id: string; name: string; email: string };
type MockMember = { userId: string; role: string };
type MockOrg = { id: string; name: string; members: MockMember[] };

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

const USER: MockUser = { _id: "user_f846", name: "Test", email: "t@t.dev" };

function setRole(role: string | null) {
	mockState.user = role === null ? null : USER;
	mockState.session =
		role === null ? null : { activeOrganizationId: "org_f846" };
	mockState.orgs =
		role === null
			? []
			: [
					{
						id: "org_f846",
						name: "Org",
						members: [{ userId: USER._id, role }],
					},
				];
}

async function storeBlob(t: ReturnType<typeof convexTest>, text = "x") {
	return (await t.run(async (ctx) =>
		(await ctx.storage.store(new Blob([text]))) as unknown as string,
	)) as never;
}

async function blobExists(
	t: ReturnType<typeof convexTest>,
	storageId: never,
) {
	return await t.run(
		async (ctx) => (await ctx.storage.get(storageId)) !== null,
	);
}

async function seedTour(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) =>
		ctx.db.insert("tours", {
			organizationId: "org_f846",
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
		}),
	);
}

describe("tourImages.discard (F846)", () => {
	it("deletes a stored blob nothing references", async () => {
		const t = convexTest(schema, modules);
		setRole("member");
		const storageId = await storeBlob(t);
		await t.mutation(api.tourImages.discard, { storageId });
		expect(await blobExists(t, storageId)).toBe(false);
	});

	it("keeps a blob a tourImages row references (retry/double-submit)", async () => {
		const t = convexTest(schema, modules);
		setRole("member");
		const tourId = await seedTour(t);
		const storageId = await storeBlob(t);
		await t.mutation(internal.tourImages.internalAdd, {
			organizationId: "org_f846",
			userId: USER._id,
			tourId,
			storageId,
		});
		await t.mutation(api.tourImages.discard, { storageId });
		expect(await blobExists(t, storageId)).toBe(true);
	});

	it("keeps a blob a files row references", async () => {
		const t = convexTest(schema, modules);
		setRole("member");
		const storageId = await storeBlob(t);
		await t.mutation(internal.files.internalTrack, {
			organizationId: "org_f846",
			uploadedBy: USER._id,
			storageId,
			filename: "img.png",
			contentType: "image/png",
			size: 1024,
			purpose: "tour-image",
		});
		await t.mutation(api.tourImages.discard, { storageId });
		expect(await blobExists(t, storageId)).toBe(true);
	});

	it("rejects unauthenticated callers", async () => {
		const t = convexTest(schema, modules);
		setRole(null);
		const storageId = await storeBlob(t);
		await expect(
			t.mutation(api.tourImages.discard, { storageId }),
		).rejects.toThrow();
		expect(await blobExists(t, storageId)).toBe(true);
	});

	// The full failure shape: the gallery is at the cap, the add is
	// rejected, and the follow-up discard reclaims the blob — storage
	// ends clean instead of accumulating an untracked object.
	it("a capped add rejection leaves no blob behind", async () => {
		const t = convexTest(schema, modules);
		setRole("member");
		const tourId = await seedTour(t);
		await t.run(async (ctx) => {
			for (let i = 0; i < 200; i++) {
				await ctx.db.insert("tourImages", {
					organizationId: "org_f846",
					tourId,
					storageId: await ctx.storage.store(new Blob([`img ${i}`])),
					altText: "",
					isPrimary: false,
					displayOrder: i,
					width: 0,
					height: 0,
					fileSize: 0,
					format: "",
					createdAt: 0,
					updatedAt: 0,
				});
			}
		});

		const storageId = await storeBlob(t, "orphan");
		await expect(
			t.mutation(internal.tourImages.internalAdd, {
				organizationId: "org_f846",
				userId: USER._id,
				tourId,
				storageId,
			}),
		).rejects.toThrow("Gallery is full");

		await t.mutation(api.tourImages.discard, { storageId });
		expect(await blobExists(t, storageId)).toBe(false);
	});
});
