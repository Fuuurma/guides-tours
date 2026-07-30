// Tests for convex/ota/integrations.ts read queries.
//
// Coverage:
//   - list: returns all OTA integrations for an org
//   - list: returns [] when the org has no integrations
//   - list: strips secrets (apiSecret + webhookSecret) from the response
//   - get: returns a single integration by ID
//   - get: returns null when the integration is not found
//   - get: strips secrets from the response
//   - getForWebhook: returns the integration fields a webhook handler
//     needs (organizationId, provider, isActive, webhookSecret) by ID
//   - getForWebhook: returns null when no matching integration is found
//
// Auth notes:
// `list` and `get` are public queries tenant-scoped via requireMembership
// (Better Auth org plugin). The @convex-dev/better-auth Convex adapter
// can't resolve a session from a Bearer token inside convex-test (same
// limitation documented in organizations.test.ts), so we mock `../auth`
// to drive the real query logic with controlled auth data.
// `getForWebhook` is an internal query with no auth — webhook handlers
// run as cron/external callbacks — so we call it directly without mocking.

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.{ts,tsx}");

// ---- Mock auth shapes ------------------------------------------------------

type MockUser = { _id: string; name: string; email: string };
type MockSession = { activeOrganizationId?: string | null };
type MockMember = { userId: string; role: string };
type MockOrg = { id: string; name: string; slug: string; members: MockMember[] };

// ---- Hoisted mock state (shared with the vi.mock factory) ------------------

const { mockState } = vi.hoisted(() => ({
	mockState: {
		user: null as MockUser | null,
		session: null as MockSession | null,
		orgs: [] as MockOrg[],
	},
}));

// `../auth` is imported by both ota/integrations.ts and lib/authz.ts, so the
// single mock covers requireMembership -> getActiveMembership for `list` and
// `get`. createInternal (used for seeding) does not call any auth function,
// so the mock never interferes with seeding.
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

// ---- Helpers ---------------------------------------------------------------

function setState(next: {
	user?: MockUser | null;
	session?: MockSession | null;
	orgs?: MockOrg[];
}) {
	mockState.user = next.user ?? null;
	mockState.session = next.session ?? null;
	mockState.orgs = next.orgs ?? [];
}

const ADMIN: MockUser = {
	_id: "u_admin",
	name: "Admin",
	email: "admin@example.com",
};

/**
 * Make the mock caller a member of `orgId` with the given role.
 * Sets the active organization so getActiveMembership resolves via the
 * active-org path (not the first-org fallback).
 */
function asOrgMember(orgId: string, role: MockMember["role"] = "owner") {
	setState({
		user: ADMIN,
		session: { activeOrganizationId: orgId },
		orgs: [
			{
				id: orgId,
				name: "Test Org",
				slug: orgId,
				members: [{ userId: ADMIN._id, role }],
			},
		],
	});
}

/**
 * Seed an OTA integration with encrypted secrets via the internal
 * create mutation (mirrors the mutations test suite). Returns the
 * integration ID.
 */
async function seedIntegration(
	t: ReturnType<typeof convexTest>,
	opts: {
		organizationId: string;
		provider: string;
		apiKey?: string;
		apiSecret?: string;
		webhookSecret?: string;
		isSandbox?: boolean;
	},
): Promise<Id<"otaIntegrations">> {
	return await t.mutation(internal.ota.integrations_mutations.createInternal, {
		organizationId: opts.organizationId,
		userId: ADMIN._id,
		provider: opts.provider,
		apiKey: opts.apiKey ?? "test-api-key",
		apiSecret: opts.apiSecret,
		webhookSecret: opts.webhookSecret,
		isSandbox: opts.isSandbox ?? false,
	});
}

// ---- Tests -----------------------------------------------------------------

describe("convex/ota/integrations — list", () => {
	beforeEach(() => setState({}));

	it("returns all OTA integrations for the caller's org", async () => {
		const t = convexTest(schema, modules);
		await seedIntegration(t, {
			organizationId: "org_list_a",
			provider: "viator",
		});
		await seedIntegration(t, {
			organizationId: "org_list_a",
			provider: "klook",
		});
		// Different org — must NOT appear in the result.
		await seedIntegration(t, {
			organizationId: "org_list_other",
			provider: "booking",
		});

		asOrgMember("org_list_a");
		const rows = (await t.query(api.ota.integrations.list, {})) as Array<{
			organizationId: string;
			provider: string;
		}>;

		expect(rows).toHaveLength(2);
		const providers = rows.map((r) => r.provider).sort();
		expect(providers).toEqual(["klook", "viator"]);
		expect(rows.every((r) => r.organizationId === "org_list_a")).toBe(true);
	});

	it("returns an empty array when the org has no integrations", async () => {
		const t = convexTest(schema, modules);
		// Seed into a different org so the table isn't empty globally.
		await seedIntegration(t, {
			organizationId: "org_list_other",
			provider: "viator",
		});

		asOrgMember("org_list_empty");
		const rows = await t.query(api.ota.integrations.list, {});
		expect(rows).toEqual([]);
	});

	it("strips apiSecret and webhookSecret from the response", async () => {
		const t = convexTest(schema, modules);
		await seedIntegration(t, {
			organizationId: "org_list_secrets",
			provider: "viator",
			apiKey: "plain-api-key",
			apiSecret: "plain-api-secret",
			webhookSecret: "plain-webhook-secret",
		});

		asOrgMember("org_list_secrets");
		const rows = (await t.query(api.ota.integrations.list, {})) as Array<
			Record<string, unknown>
		>;

		expect(rows).toHaveLength(1);
		const row = rows[0]!;
		// apiSecret and webhookSecret must never round-trip to the client.
		expect("apiSecret" in row).toBe(false);
		expect("webhookSecret" in row).toBe(false);
		expect(row.apiSecret).toBeUndefined();
		expect(row.webhookSecret).toBeUndefined();
		// apiKey is stored as encrypted ciphertext and IS returned (the FE
		// never needs the plaintext, but the column isn't stripped). Verify
		// it's present but not the plaintext value.
		expect(row.apiKey).toBeDefined();
		expect(row.apiKey).not.toContain("plain-api-key");
	});
});

describe("convex/ota/integrations — get", () => {
	beforeEach(() => setState({}));

	it("returns a single integration by ID", async () => {
		const t = convexTest(schema, modules);
		const id = await seedIntegration(t, {
			organizationId: "org_get_a",
			provider: "viator",
		});

		asOrgMember("org_get_a");
		const row = (await t.query(api.ota.integrations.get, {
			integrationId: id,
		})) as { _id: string; provider: string; organizationId: string } | null;

		expect(row).not.toBeNull();
		expect(row?._id).toBe(id);
		expect(row?.provider).toBe("viator");
		expect(row?.organizationId).toBe("org_get_a");
	});

	it("returns null when the integration is not found", async () => {
		const t = convexTest(schema, modules);
		// Seed a real integration so we get a valid-format otaIntegrations
		// ID, then hard-delete it so the row no longer exists. Convex
		// validates the ID format before the handler runs, so a fabricated
		// string would be rejected at the validator layer — using a real
		// (now-deleted) ID exercises the handler's null path instead.
		const id = await seedIntegration(t, {
			organizationId: "org_get_missing",
			provider: "viator",
		});
		await t.run(async (ctx) => {
			await ctx.db.delete(id);
		});

		asOrgMember("org_get_missing");
		const row = await t.query(api.ota.integrations.get, {
			integrationId: id,
		});
		expect(row).toBeNull();
	});

	it("returns null when the integration belongs to a different org", async () => {
		const t = convexTest(schema, modules);
		const id = await seedIntegration(t, {
			organizationId: "org_get_owner",
			provider: "viator",
		});

		// Caller is a member of a different org — get must not leak the row.
		asOrgMember("org_get_other");
		const row = await t.query(api.ota.integrations.get, {
			integrationId: id,
		});
		expect(row).toBeNull();
	});

	it("strips apiSecret and webhookSecret from the response", async () => {
		const t = convexTest(schema, modules);
		const id = await seedIntegration(t, {
			organizationId: "org_get_secrets",
			provider: "klook",
			apiKey: "plain-api-key",
			apiSecret: "plain-api-secret",
			webhookSecret: "plain-webhook-secret",
		});

		asOrgMember("org_get_secrets");
		const row = (await t.query(api.ota.integrations.get, {
			integrationId: id,
		})) as Record<string, unknown> | null;

		expect(row).not.toBeNull();
		expect("apiSecret" in row!).toBe(false);
		expect("webhookSecret" in row!).toBe(false);
		expect(row?.apiSecret).toBeUndefined();
		expect(row?.webhookSecret).toBeUndefined();
		// apiKey is encrypted ciphertext and is returned (not stripped).
		expect(row?.apiKey).toBeDefined();
		expect(row?.apiKey).not.toContain("plain-api-key");
	});
});

describe("convex/ota/integrations — getForWebhook (internal)", () => {
	it("returns the integration fields a webhook handler needs", async () => {
		const t = convexTest(schema, modules);
		const id = await seedIntegration(t, {
			organizationId: "org_webhook_a",
			provider: "viator",
			webhookSecret: "plain-webhook-secret",
		});

		// No auth context — getForWebhook is an internal query.
		const row = (await t.query(internal.ota.integrations.getForWebhook, {
			integrationId: id,
		})) as {
			organizationId: string;
			provider: string;
			isActive: boolean;
			webhookSecret: string | undefined;
		} | null;

		expect(row).not.toBeNull();
		expect(row?.organizationId).toBe("org_webhook_a");
		expect(row?.provider).toBe("viator");
		expect(row?.isActive).toBe(true);
		// webhookSecret is returned (as encrypted ciphertext) so the
		// webhook handler can decrypt + verify the signature. It must
		// not be the plaintext value.
		expect(row?.webhookSecret).toBeDefined();
		expect(row?.webhookSecret).not.toContain("plain-webhook-secret");
	});

	it("returns null when no matching integration is found", async () => {
		const t = convexTest(schema, modules);
		// Seed + hard-delete to obtain a valid-format ID that no longer
		// exists (Convex rejects fabricated IDs at the validator layer).
		const id = await seedIntegration(t, {
			organizationId: "org_webhook_missing",
			provider: "viator",
		});
		await t.run(async (ctx) => {
			await ctx.db.delete(id);
		});
		const row = await t.query(internal.ota.integrations.getForWebhook, {
			integrationId: id,
		});
		expect(row).toBeNull();
	});
});
