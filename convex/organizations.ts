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
import { loadUserContact } from "./lib/userContact";

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
 * OrgSwitcher dropdown in the navbar.
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
	/** Better Auth user.phone — used for SMS (assignment notify, avail reminders). */
	phone: string;
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
				phone?: string | null;
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

		const filtered = members.filter((m) =>
			roleFilter ? roleFilter.has(m.role) : true,
		);

		// Cap enrichment so a huge org can't blow the query budget.
		const MAX_ENRICH = 200;
		const out: OrgMember[] = [];
		for (const m of filtered.slice(0, MAX_ENRICH)) {
			let phone = (m.user?.phone ?? "").trim();
			// Better Auth normally returns the user object. If a member was
			// removed between the membership read and enrichment, keep the
			// operator-facing label human-readable instead of leaking a raw ID.
			let name = m.user?.name?.trim() || m.user?.email || "Former member";
			let email = m.user?.email ?? "";
			// Better Auth listMembers often omits additionalFields like phone —
			// fill from the user row when missing.
			if (!phone) {
				const contact = await loadUserContact(ctx, m.userId);
				if (contact) {
					phone = contact.phone;
					if (!email) email = contact.email;
					if (!m.user?.name?.trim() && contact.name) name = contact.name;
				}
			}
			out.push({
				userId: m.userId,
				name,
				email,
				role: m.role,
				image: m.user?.image ?? null,
				phone,
			});
		}

		return out.sort((a, b) => a.name.localeCompare(b.name));
	},
});
