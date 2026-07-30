// Tests for convex/organizations.ts queries.
//
// Coverage:
//   1. activeOrganization — returns the active org for an authenticated user
//   2. activeOrganization — returns null when no active org is set
//   3. listMyOrganizations — returns every org the user is a member of
//   4. listMyOrganizations — returns [] when the user has no memberships
//   5. listMembers — returns members of the active org with role info
//   6. listMembers — rejects unauthenticated callers (throws)
//   7. listMembers — rejects a user who isn't a member of the resolved
//      organization, i.e. belongs to a different org (throws)
//
// Why we mock `../auth`:
// The organization queries are thin wrappers over the Better Auth
// organization-plugin API (auth.api.getSession / getFullOrganization /
// listOrganizations / listMembers) plus mapping logic. The @convex-dev/
// better-auth Convex adapter (v0.12.5) does not populate the `join`
// parameter that Better Auth's `findSession` uses to attach the user to a
// session row, so `auth.api.getSession` cannot resolve a session from a
// Bearer token inside convex-test (no cookie-cache path is available
// either, since the app config doesn't enable session.cookieCache). That
// makes a full end-to-end Better Auth flow untestable here — the same
// reason every other test in this suite bypasses requireMembership (see
// customers.test.ts / bookings.test.ts headers).
//
// Instead we mock `authComponent` + `createAuth` so we can drive the
// real query/mapping logic in organizations.ts (role extraction,
// memberCount, isActive flag, role filtering, name sorting, enrichment
// fallback) with controlled auth data. `loadUserContact` is mocked too so
// listMembers never reaches across to the (unregistered) betterAuth
// component for phone enrichment.

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

// ---- Mock shapes -----------------------------------------------------------

type MockUser = {
	_id: string;
	name: string;
	email: string;
	phone?: string;
	image?: string | null;
};

type MockSession = { activeOrganizationId?: string | null };

type MockMember = {
	userId: string;
	role: string;
	user?: {
		id?: string;
		name?: string | null;
		email?: string | null;
		image?: string | null;
		phone?: string | null;
	};
};

type MockOrg = {
	id: string;
	name: string;
	slug: string;
	logo?: string | null;
	createdAt: number;
	members: MockMember[];
};

// ---- Hoisted mock state (shared with vi.mock factories) --------------------

const { mockState } = vi.hoisted(() => ({
	mockState: {
		user: null as MockUser | null,
		session: null as MockSession | null,
		orgs: [] as MockOrg[],
	},
}));

// `../auth` is imported by both organizations.ts and lib/authz.ts, so the
// one mock covers activeOrganization / listMyOrganizations / listMembers
// (which goes through requireMembership -> getActiveMembership).
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
					getFullOrganization: async (args: {
						query: { organizationId: string };
					}) =>
						mockState.orgs.find((o) => o.id === args.query.organizationId) ??
						null,
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
	// createAuth is only passed back into authComponent.getAuth, which the
	// mock ignores — a no-op stub is sufficient.
	createAuth: (() => ({})) as never,
}));

// listMembers enriches members without a phone via loadUserContact, which
// would call the (unregistered) betterAuth component. Mock it so the query
// stays fully isolated and exercises only its own mapping logic.
vi.mock("../lib/userContact", () => ({
	loadUserContact: async () => null,
}));

const modules = import.meta.glob("../**/*.{ts,tsx}");

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

const ALICE: MockUser = {
	_id: "u_alice",
	name: "Alice",
	email: "alice@example.com",
	phone: "+15550000001",
	image: null,
};

// ---- Tests -----------------------------------------------------------------

describe("convex/organizations — activeOrganization", () => {
	beforeEach(() => setState({}));

	it("returns the active organization for an authenticated user", async () => {
		setState({
			user: ALICE,
			session: { activeOrganizationId: "org_acme" },
			orgs: [
				{
					id: "org_acme",
					name: "Acme Tours",
					slug: "acme",
					logo: null,
					createdAt: 1000,
					members: [
						{ userId: "u_alice", role: "owner" },
						{ userId: "u_bob", role: "guide" },
					],
				},
			],
		});

		const t = convexTest(schema, modules);
		const res = (await t.query(api.organizations.activeOrganization, {})) as {
			id: string;
			name: string;
			slug: string;
			logo: string | null;
			createdAt: number;
			role: string;
			memberCount: number;
		} | null;

		expect(res).not.toBeNull();
		expect(res?.id).toBe("org_acme");
		expect(res?.name).toBe("Acme Tours");
		expect(res?.slug).toBe("acme");
		expect(res?.logo).toBeNull();
		expect(res?.createdAt).toBe(1000);
		// Role is resolved from the org's member list for the caller.
		expect(res?.role).toBe("owner");
		expect(res?.memberCount).toBe(2);
	});

	it("returns null when the user has no active organization set", async () => {
		setState({
			user: ALICE,
			// Authenticated, but session.activeOrganizationId is unset.
			session: { activeOrganizationId: null },
			orgs: [
				{
					id: "org_acme",
					name: "Acme Tours",
					slug: "acme",
					logo: null,
					createdAt: 1000,
					members: [{ userId: "u_alice", role: "owner" }],
				},
			],
		});

		const t = convexTest(schema, modules);
		const res = await t.query(api.organizations.activeOrganization, {});
		expect(res).toBeNull();
	});
});

describe("convex/organizations — listMyOrganizations", () => {
	beforeEach(() => setState({}));

	it("returns all organizations the user is a member of", async () => {
		setState({
			user: ALICE,
			session: { activeOrganizationId: "org_acme" },
			orgs: [
				{
					id: "org_acme",
					name: "Acme Tours",
					slug: "acme",
					logo: null,
					createdAt: 1000,
					members: [{ userId: "u_alice", role: "owner" }],
				},
				{
					id: "org_globetrotter",
					name: "Globetrotter",
					slug: "globetrotter",
					logo: "https://example.com/logo.png",
					createdAt: 2000,
					members: [{ userId: "u_alice", role: "admin" }],
				},
			],
		});

		const t = convexTest(schema, modules);
		const res = (await t.query(api.organizations.listMyOrganizations, {})) as Array<{
			id: string;
			name: string;
			slug: string;
			logo: string | null;
			isActive: boolean;
		}>;

		expect(res).toHaveLength(2);
		const acme = res.find((o) => o.id === "org_acme");
		const globe = res.find((o) => o.id === "org_globetrotter");
		expect(acme?.name).toBe("Acme Tours");
		expect(acme?.slug).toBe("acme");
		expect(acme?.logo).toBeNull();
		// The session's active org is highlighted.
		expect(acme?.isActive).toBe(true);
		expect(globe?.name).toBe("Globetrotter");
		expect(globe?.logo).toBe("https://example.com/logo.png");
		expect(globe?.isActive).toBe(false);
	});

	it("returns an empty array when the user has no memberships", async () => {
		setState({
			user: ALICE,
			session: null,
			orgs: [],
		});

		const t = convexTest(schema, modules);
		const res = await t.query(api.organizations.listMyOrganizations, {});
		expect(res).toEqual([]);
	});
});

describe("convex/organizations — listMembers", () => {
	beforeEach(() => setState({}));

	it("returns members of the active organization with role information", async () => {
		setState({
			user: ALICE,
			session: { activeOrganizationId: "org_acme" },
			orgs: [
				{
					id: "org_acme",
					name: "Acme Tours",
					slug: "acme",
					logo: null,
					createdAt: 1000,
					members: [
						{
							userId: "u_alice",
							role: "owner",
							user: {
								name: "Alice",
								email: "alice@example.com",
								image: null,
								phone: "+15550000001",
							},
						},
						{
							userId: "u_bob",
							role: "guide",
							user: {
								name: "Bob",
								email: "bob@example.com",
								image: "https://example.com/bob.png",
								phone: "+15550000002",
							},
						},
					],
				},
			],
		});

		const t = convexTest(schema, modules);
		const res = (await t.query(api.organizations.listMembers, {})) as Array<{
			userId: string;
			name: string;
			email: string;
			role: string;
			image: string | null;
			phone: string;
		}>;

		// Members are sorted alphabetically by name.
		expect(res.map((m) => m.name)).toEqual(["Alice", "Bob"]);
		const alice = res.find((m) => m.userId === "u_alice");
		const bob = res.find((m) => m.userId === "u_bob");
		expect(alice?.role).toBe("owner");
		expect(alice?.email).toBe("alice@example.com");
		expect(alice?.phone).toBe("+15550000001");
		expect(alice?.image).toBeNull();
		expect(bob?.role).toBe("guide");
		expect(bob?.image).toBe("https://example.com/bob.png");
	});

	it("rejects unauthenticated users (throws)", async () => {
		// No identity -> authComponent.getAuthUser returns null ->
		// requireUser throws "Unauthorized: sign in required".
		setState({ user: null, session: null, orgs: [] });

		const t = convexTest(schema, modules);
		await expect(
			t.query(api.organizations.listMembers, {}),
		).rejects.toThrow(/Unauth/i);
	});

	it("rejects a user who is not a member of the resolved organization (throws)", async () => {
		// The caller is authenticated but belongs to a *different*
		// organization than the one they resolve to. With no active org
		// set, getActiveMembership falls back to the first org from
		// listOrganizations. If the caller isn't in that org's member
		// list, requireMembership throws a "not a member of organization"
		// data-inconsistency error rather than silently granting access.
		setState({
			user: ALICE,
			session: { activeOrganizationId: null },
			orgs: [
				{
					id: "org_other",
					name: "Other Co",
					slug: "other",
					logo: null,
					createdAt: 1000,
					// Alice is NOT a member of this org.
					members: [{ userId: "u_carol", role: "owner" }],
				},
			],
		});

		const t = convexTest(schema, modules);
		await expect(
			t.query(api.organizations.listMembers, {}),
		).rejects.toThrow(/not a member of organization/i);
	});
});
