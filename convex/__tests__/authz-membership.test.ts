process.env.ENCRYPTION_KEY ??= "a".repeat(64);

import { describe, expect, it, vi } from "vitest";
import { getActiveMembership, type Ctx } from "../lib/authz";

// devin 09-01 P1 (fail-closed 09-10): getActiveMembership silently fell back
// to the user's "first org" for multi-org users with no active org set
// (warn-only) — cross-tenant write risk. Now: single-org users keep the
// back-compat fallback; multi-org users without an active org throw so the
// client must call setActiveOrganization (org switcher / sign-in / callback).
//
// Mock pattern shared with organizations.test.ts: ../auth is stubbed so the
// real membership-resolution logic runs against controlled auth data.

type MockUser = { _id: string; name: string; email: string };
type MockSession = { activeOrganizationId?: string | null };
type MockMember = { userId: string; role: string };
type MockOrg = { id: string; name: string; members: MockMember[] };

const { mockState } = vi.hoisted(() => ({
	mockState: {
		user: null as MockUser | null,
		session: null as MockSession | null,
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

const USER: MockUser = { _id: "user_1", name: "Ana", email: "ana@test.dev" };
const ORG_A: MockOrg = {
	id: "org_a",
	name: "A Tours",
	members: [{ userId: USER._id, role: "owner" }],
};
const ORG_B: MockOrg = {
	id: "org_b",
	name: "B Tours",
	members: [{ userId: USER._id, role: "member" }],
};

function setState(next: {
	user?: MockUser | null;
	session?: MockSession | null;
	orgs?: MockOrg[];
}) {
	mockState.user = next.user ?? null;
	mockState.session = next.session ?? null;
	mockState.orgs = next.orgs ?? [];
}

const CTX = {} as unknown as Ctx;

describe("getActiveMembership fail-closed (multi-org, no active org)", () => {
	it("throws for multi-org users with no active org set", async () => {
		setState({ user: USER, session: {}, orgs: [ORG_A, ORG_B] });
		await expect(getActiveMembership(CTX)).rejects.toThrow(
			/No active organization/,
		);
	});

	it("keeps the back-compat fallback for single-org users", async () => {
		setState({ user: USER, session: {}, orgs: [ORG_A] });
		const member = await getActiveMembership(CTX);
		expect(member.organizationId).toBe(ORG_A.id);
		expect(member.role).toBe("owner");
	});

	it("resolves the explicit active org when set", async () => {
		setState({
			user: USER,
			session: { activeOrganizationId: ORG_B.id },
			orgs: [ORG_A, ORG_B],
		});
		const member = await getActiveMembership(CTX);
		expect(member.organizationId).toBe(ORG_B.id);
		expect(member.role).toBe("member");
	});

	it("throws when the user has no organization at all", async () => {
		setState({ user: USER, session: {}, orgs: [] });
		await expect(getActiveMembership(CTX)).rejects.toThrow(
			/No organization/,
		);
	});

	it("throws for unauthenticated callers", async () => {
		setState({ user: null, session: null, orgs: [ORG_A] });
		await expect(getActiveMembership(CTX)).rejects.toThrow(/Unauthorized/);
	});
});
