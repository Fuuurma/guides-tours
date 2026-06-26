// Tests for OTA integration admin mutations.
// Verifies the internal create / update / remove flow with proper
// encryption at rest. Also confirms the rejection paths for unknown
// providers and cross-org access.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

// E2E encryption requires the ENCRYPTION_KEY env var. The crypto
// module falls back to a deterministic test key in non-prod, so we
// don't need to set it here.
process.env.ENCRYPTION_KEY ??= "a".repeat(64);

describe("convex/ota/integrations_mutations", () => {
	describe("createInternal", () => {
		it("creates an integration for a valid provider", async () => {
			const t = convexTest(schema, modules);
			const id = await t.mutation(
				internal.ota.integrations_mutations.createInternal,
				{
					organizationId: "org_a",
					userId: "user_admin",
					provider: "viator",
					apiKey: "test-api-key",
					apiSecret: "test-secret",
					isSandbox: true,
					webhookSecret: "test-webhook",
				},
			);
			expect(id).toBeDefined();
		});

		it("rejects an unknown provider", async () => {
			const t = convexTest(schema, modules);
			await expect(
				t.mutation(
					internal.ota.integrations_mutations.createInternal,
					{
						organizationId: "org_b",
						userId: "user_admin",
						provider: "fake-provider",
						apiKey: "k",
						isSandbox: false,
					},
				),
			).rejects.toThrow(/Unknown provider/);
		});

		it("rejects a second integration for the same provider", async () => {
			const t = convexTest(schema, modules);
			await t.mutation(
				internal.ota.integrations_mutations.createInternal,
				{
					organizationId: "org_c",
					userId: "user_admin",
					provider: "klook",
					apiKey: "k",
					isSandbox: false,
				},
			);
			await expect(
				t.mutation(
					internal.ota.integrations_mutations.createInternal,
					{
						organizationId: "org_c",
						userId: "user_admin",
						provider: "klook",
						apiKey: "k2",
						isSandbox: false,
					},
				),
			).rejects.toThrow(/already exists/);
		});

		it("encrypts the API key at rest", async () => {
			const t = convexTest(schema, modules);
			const id = await t.mutation(
				internal.ota.integrations_mutations.createInternal,
				{
					organizationId: "org_d",
					userId: "user_admin",
					provider: "airbnb",
					apiKey: "super-secret-key",
					isSandbox: false,
				},
			);
			const row = await t.run(async (ctx) => ctx.db.get(id));
			expect(row?.apiKey).not.toContain("super-secret-key");
			expect(row?.apiKey).toBeTruthy();
		});

		it("accepts all 7 supported providers", async () => {
			const t = convexTest(schema, modules);
			const providers = [
				"viator",
				"getyourguide",
				"airbnb",
				"tripadvisor",
				"klook",
				"booking",
				"expedia",
			];
			for (const provider of providers) {
				const id = await t.mutation(
					internal.ota.integrations_mutations.createInternal,
					{
						organizationId: `org_${provider}`,
						userId: "user_admin",
						provider,
						apiKey: "k",
						isSandbox: false,
					},
				);
				expect(id).toBeDefined();
			}
		});
	});

	describe("updateInternal", () => {
		it("updates an integration in the same org", async () => {
			const t = convexTest(schema, modules);
			const id = await t.mutation(
				internal.ota.integrations_mutations.createInternal,
				{
					organizationId: "org_e",
					userId: "user_admin",
					provider: "booking",
					apiKey: "k",
					isSandbox: false,
				},
			);
			await t.mutation(
				internal.ota.integrations_mutations.updateInternal,
				{
					organizationId: "org_e",
					userId: "user_admin",
					integrationId: id,
					isActive: false,
					syncIntervalMinutes: 30,
				},
			);
			const row = await t.run(async (ctx) => ctx.db.get(id));
			expect(row?.isActive).toBe(false);
			expect(row?.syncIntervalMinutes).toBe(30);
		});

		it("rejects updates from a different org", async () => {
			const t = convexTest(schema, modules);
			const id = await t.mutation(
				internal.ota.integrations_mutations.createInternal,
				{
					organizationId: "org_f",
					userId: "user_admin",
					provider: "expedia",
					apiKey: "k",
					isSandbox: false,
				},
			);
			await expect(
				t.mutation(
					internal.ota.integrations_mutations.updateInternal,
					{
						organizationId: "org_g",
						userId: "user_admin_g",
						integrationId: id,
						isActive: false,
					},
				),
			).rejects.toThrow(/different organization/);
		});

		it("re-encrypts the API key when updated", async () => {
			const t = convexTest(schema, modules);
			const id = await t.mutation(
				internal.ota.integrations_mutations.createInternal,
				{
					organizationId: "org_h",
					userId: "user_admin",
					provider: "tripadvisor",
					apiKey: "old-key",
					isSandbox: false,
				},
			);
			await t.mutation(
				internal.ota.integrations_mutations.updateInternal,
				{
					organizationId: "org_h",
					userId: "user_admin",
					integrationId: id,
					apiKey: "new-key",
				},
			);
			const row = await t.run(async (ctx) => ctx.db.get(id));
			expect(row?.apiKey).not.toContain("old-key");
			expect(row?.apiKey).not.toContain("new-key");
		});
	});

	describe("removeInternal", () => {
		it("soft-disables an integration", async () => {
			const t = convexTest(schema, modules);
			const id = await t.mutation(
				internal.ota.integrations_mutations.createInternal,
				{
					organizationId: "org_i",
					userId: "user_admin",
					provider: "getyourguide",
					apiKey: "k",
					isSandbox: false,
				},
			);
			await t.mutation(
				internal.ota.integrations_mutations.removeInternal,
				{
					organizationId: "org_i",
					userId: "user_admin",
					integrationId: id,
				},
			);
			const row = await t.run(async (ctx) => ctx.db.get(id));
			expect(row?.isActive).toBe(false);
			expect(row).not.toBeNull();
		});

		it("rejects removes from a different org", async () => {
			const t = convexTest(schema, modules);
			const id = await t.mutation(
				internal.ota.integrations_mutations.createInternal,
				{
					organizationId: "org_j",
					userId: "user_admin",
					provider: "viator",
					apiKey: "k",
					isSandbox: false,
				},
			);
			await expect(
				t.mutation(
					internal.ota.integrations_mutations.removeInternal,
					{
						organizationId: "org_other",
						userId: "user_admin",
						integrationId: id,
					},
				),
			).rejects.toThrow(/different organization/);
		});
	});
});
