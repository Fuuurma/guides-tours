import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";
import { _resetKeyForTest } from "../lib/crypto";

const modules = import.meta.glob("../**/*.{ts,tsx}");

// Set ENCRYPTION_KEY once for all tests in this file
process.env.ENCRYPTION_KEY ??= "a".repeat(64);

async function seedSettings(
	ctx: any,
	orgId: string,
	overrides: Record<string, any> = {},
) {
	return await ctx.db.insert("notificationSettings", {
		organizationId: orgId,
		twilioEnabled: false,
		whatsappEnabled: false,
		emailEnabled: true,
		useCompanyDefaults: true,
		requireSmsConsent: true,
		requireEmailConsent: true,
		maxRetries: 3,
		retryDelayMinutes: 5,
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	});
}

describe("notification settings", () => {
	it("upsert: creates settings with safe defaults", async () => {
		const t = convexTest(schema, modules);
		_resetKeyForTest();
		const id = await t.mutation(
			internal.notificationSettings.internalUpsert,
			{
				organizationId: "org_ns1",
				userId: "user-1",
				emailEnabled: true,
			},
		);
		expect(id).toBeDefined();
		const row = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(row?.emailEnabled).toBe(true);
		expect(row?.requireSmsConsent).toBe(true);
		expect(row?.maxRetries).toBe(3);
	});

	it("upsert: patches existing row", async () => {
		const t = convexTest(schema, modules);
		_resetKeyForTest();
		const orgId = "org_ns2";
		const id = await t.run((ctx) => seedSettings(ctx, orgId));
		await t.mutation(internal.notificationSettings.internalUpsert, {
			organizationId: orgId,
			userId: "user-1",
			twilioEnabled: true,
			twilioPhoneNumber: "+15555550100",
			maxRetries: 5,
		});
		const row = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(row?.twilioEnabled).toBe(true);
		expect(row?.twilioPhoneNumber).toBe("+15555550100");
		expect(row?.maxRetries).toBe(5);
	});

	it("upsert: encrypts twilioAuthToken when provided", async () => {
		const t = convexTest(schema, modules);
		_resetKeyForTest();
		const orgId = "org_ns3";
		const id = await t.mutation(
			internal.notificationSettings.internalUpsert,
			{
				organizationId: orgId,
				userId: "user-1",
				encryptedAuthToken: "iv_hex:ct_hex:tag_hex",
				twilioEnabled: true,
			},
		);
		const row = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(row?.twilioAuthToken).toBe("iv_hex:ct_hex:tag_hex");
	});

	it("remove: deletes settings", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ns4";
		const id = await t.run((ctx) => seedSettings(ctx, orgId));
		await t.mutation(internal.notificationSettings.internalRemove, {
			organizationId: orgId,
			userId: "user-1",
		});
		const row = await t.run((ctx) => ctx.db.get(id));
		expect(row).toBeNull();
	});

	it("remove: rejects missing settings", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(internal.notificationSettings.internalRemove, {
				organizationId: "org_ns5",
				userId: "user-1",
			}),
		).rejects.toThrow(/not found/);
	});
});
