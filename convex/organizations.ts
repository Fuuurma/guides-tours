// Organization membership queries.
//
// `activeOrganization` returns the caller's currently-selected org
// (via Better Auth's session.activeOrganizationId), with the caller's
// role. Used by the dashboard + OrgSwitcher.
//
// Source: /api/auth/me equivalent + /api/staff/company settings from
// reservations-automation (combined into one helper).

import { v, ConvexError } from "convex/values";
import { query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { requireMembership } from "./lib/authz";

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

export type OrgMember = {
	userId: string;
	name: string;
	email: string;
	role: string;
	image: string | null;
};

/**
 * List members of the caller's active organization.
 * Optional `roles` filter (e.g. ["guide","owner","admin"] for assignment pickers).
 */
export const listMembers = query({
	args: {
		roles: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args): Promise<OrgMember[]> => {
		const member = await requireMembership(ctx);
		const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
		let members: Array<{
			userId: string;
			role: string;
			user?: {
				id?: string;
				name?: string | null;
				email?: string | null;
				image?: string | null;
			};
		}> = [];
		try {
			const memberList = await auth.api.listMembers({
				headers,
				query: { organizationId: member.organizationId },
			});
			members = memberList.members ?? [];
		} catch (err) {
			// Surface auth/API failures so the FE error UI can show them
			// instead of an empty roster that looks like "no members".
			throw new ConvexError(
				`Failed to list organization members: ${err instanceof Error ? err.message : String(err)}`,
			);
		}

		const roleFilter =
			args.roles && args.roles.length > 0 ? new Set(args.roles) : null;

		return members
			.filter((m) => (roleFilter ? roleFilter.has(m.role) : true))
			.map((m) => ({
				userId: m.userId,
				name: m.user?.name?.trim() || m.user?.email || m.userId,
				email: m.user?.email ?? "",
				role: m.role,
				image: m.user?.image ?? null,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	},
});
