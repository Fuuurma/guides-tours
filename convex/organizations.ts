// Organization membership queries.
//
// `activeOrganization` returns the caller's currently-selected org
// (via Better Auth's session.activeOrganizationId), with the caller's
// role. Used by the dashboard + OrgSwitcher.
//
// Source: /api/auth/me equivalent + /api/staff/company settings from
// reservations-automation (combined into one helper).

import { query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";

export const activeOrganization = query({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;
		const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
		const session = await auth.api.getSession({ headers });
		const activeOrgId =
			(session?.session as { activeOrganizationId?: string } | null)
				?.activeOrganizationId ?? null;
		if (!activeOrgId) return null;

		const org = await auth.api.getFullOrganization({
			headers,
			query: { organizationId: activeOrgId },
		});
		if (!org) return null;

		// Find the caller's role in this org.
		const member = org.members.find(
			(m: { userId: string }) => m.userId === user._id,
		);

		return {
			id: org.id,
			name: org.name,
			slug: org.slug,
			logo: org.logo ?? null,
			createdAt: org.createdAt,
			role: member?.role ?? "member",
			memberCount: org.members.length,
		};
	},
});

/**
 * List organizations the current user belongs to. Powers the
 * OrgSwitcher dropdown.
 *
 * @internal
 * No FE caller as of 2026-06-29. The navbar doesn't have an
 * OrgSwitcher yet — single-org users only. When multi-org
 * is fully wired, this will be called by the switcher.
 * See docs/DATA_LAYER_STATUS.md.
 */
export const listMyOrganizations = query({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];
		const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
		const list = await auth.api.listOrganizations({ headers });
		// Also pull the session's active org so the UI can highlight it.
		const session = await auth.api.getSession({ headers });
		const activeOrgId =
			(session?.session as { activeOrganizationId?: string } | null)
				?.activeOrganizationId ?? null;
		return list.map((org) => ({
			id: org.id,
			name: org.name,
			slug: org.slug,
			logo: org.logo ?? null,
			isActive: org.id === activeOrgId,
		}));
	},
});
