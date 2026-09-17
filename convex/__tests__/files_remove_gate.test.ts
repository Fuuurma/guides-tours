// F56 regression — files.remove admitted "member", and for
// purpose="tour-image" rows it also deletes the linked tourImages
// gallery row — bypassing the owner/admin-only gate on
// tourImages.remove. A member (declared read-only on tours in the
// role matrix) could strip a tour's gallery via the Files page.
//
// Now: the public mutation checks the file's purpose — tour-image
// requires owner/admin; other purposes keep the member gate.
//
// Auth seam: same vi.mock("../auth") pattern as
// authz-membership.test.ts — authComponent is stubbed so
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

const USER: MockUser = { _id: "user_f56", name: "Test", email: "t@t.dev" };

function setRole(role: string) {
	mockState.user = USER;
	mockState.session = { activeOrganizationId: "org_f56" };
	mockState.orgs = [
		{ id: "org_f56", name: "Org", members: [{ userId: USER._id, role }] },
	];
}

async function seedTourImageFile(
	t: ReturnType<typeof convexTest>,
	purpose = "tour-image",
) {
	const storageId = (await t.run(async (ctx) =>
		(await ctx.storage.store(new Blob(["x"]))) as unknown as string,
	)) as never;
	const fileId = await t.mutation(internal.files.internalTrack, {
		organizationId: "org_f56",
		uploadedBy: USER._id,
		storageId,
		filename: "img.png",
		contentType: "image/png",
		size: 1024,
		purpose,
	});
	return { storageId, fileId };
}

describe("files.remove role gate (F56)", () => {
	it("member cannot delete a tour-image file", async () => {
		const t = convexTest(schema, modules);
		setRole("member");
		const { fileId } = await seedTourImageFile(t);
		await expect(
			t.mutation(api.files.remove, { fileId }),
		).rejects.toThrow(/Forbidden/);
		// File survives.
		expect(await t.run((ctx) => ctx.db.get(fileId))).not.toBeNull();
	});

	it("member can still delete a non-tour-image file", async () => {
		const t = convexTest(schema, modules);
		setRole("member");
		const { fileId } = await seedTourImageFile(t, "customer-doc");
		await t.mutation(api.files.remove, { fileId });
		expect(await t.run((ctx) => ctx.db.get(fileId))).toBeNull();
	});

	it("admin can delete a tour-image file", async () => {
		const t = convexTest(schema, modules);
		setRole("admin");
		const { fileId } = await seedTourImageFile(t);
		await t.mutation(api.files.remove, { fileId });
		expect(await t.run((ctx) => ctx.db.get(fileId))).toBeNull();
	});

	it("deleting a tour-image file removes the gallery row + logs tourImage.deleted", async () => {
		const t = convexTest(schema, modules);
		setRole("admin");
		const { storageId, fileId } = await seedTourImageFile(t);
		const tourId = await t.run(async (ctx) =>
			ctx.db.insert("tours", {
				organizationId: "org_f56",
				name: "T",
				description: "",
				durationHours: 1,
				isActive: true,
				recurrenceType: "none",
				recurrenceDaysOfWeek: [],
				capacity: 10,
				bufferMinutes: 0,
				minGuests: 1,
				maxGuests: 10,
				bookingCutoffHours: 0,
				tourType: "walking",
				languages: [],
				requiredGuides: 1,
				inclusions: [],
				exclusions: [],
				highlights: [],
				currency: "USD",
				createdAt: 0,
				updatedAt: 0,
			}),
		);
		const imageId = await t.run(async (ctx) =>
			ctx.db.insert("tourImages", {
				organizationId: "org_f56",
				tourId,
				storageId,
				altText: "x",
				isPrimary: false,
				displayOrder: 0,
				width: 1,
				height: 1,
				fileSize: 1,
				format: "png",
				createdAt: 0,
				updatedAt: 0,
			}),
		);
		await t.mutation(api.files.remove, { fileId });
		// Gallery row gone via the by_storage_id index (F58).
		expect(await t.run((ctx) => ctx.db.get(imageId))).toBeNull();
		const audits = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		expect(
			audits.some((a) => a.action === "tourImage.deleted"),
		).toBe(true);
	});
});
