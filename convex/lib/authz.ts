// Multi-tenancy authorization helpers.
//
// Pattern (per CONVENTIONS.md §Better Auth + Convex):
// 1. Resolve the caller's identity via authComponent.getAuthUser(ctx).
// 2. Resolve the caller's active organization membership via the
//    Better Auth organization plugin (table `member`).
// 3. Assert membership before any tenant-scoped read/write.
//
// Use requireMembership() in every public query/mutation that touches
// tenant data. Throws ConvexError on failure so the client gets a clean
// 401/403 instead of an opaque internal error.
//
// Active-org resolution: Better Auth org plugin stores
// `session.activeOrganizationId`. We read it via auth.api.getSession.
// If null (user never called setActiveOrganization), we fall back to
// the user's first membership.

import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { authComponent, createAuth } from "../auth";

export type Role = "owner" | "admin" | "member" | "guide" | "driver";

export type Ctx = QueryCtx | MutationCtx | ActionCtx;

// Better Auth organization/member/user IDs are opaque strings. They
// live in tables owned by the Better Auth component, not our app
// schema, so we type them as plain strings here.
export type OrganizationId = string;
export type UserId = string;

type Member = {
	userId: UserId;
	organizationId: OrganizationId;
	role: string;
};

/**
 * Resolve the caller's identity. Throws if not authenticated.
 */
export async function requireUser(ctx: Ctx) {
	const user = await authComponent.getAuthUser(ctx);
	if (!user) {
		throw new ConvexError("Unauthorized: sign in required");
	}
	return user;
}

/**
 * Resolve the caller's active membership.
 *
 * Reads `session.activeOrganizationId` (Better Auth org plugin).
 * Falls back to the user's first org if no active org is set.
 * Throws if the user has no organization at all.
 */
export async function getActiveMembership(ctx: Ctx): Promise<Member> {
	const user = await requireUser(ctx);
	const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
	const session = await auth.api.getSession({ headers });
	const activeOrgId =
		(session?.session as { activeOrganizationId?: string } | null)
			?.activeOrganizationId ?? null;

	if (activeOrgId) {
		// Resolve the user's role in the active org.
		const memberList = await auth.api.listMembers({
			headers,
			query: { organizationId: activeOrgId },
		});
		const me = memberList.members.find(
			(m: { userId: string }) => m.userId === user._id,
		);
		if (me) {
			return {
				userId: user._id,
				organizationId: activeOrgId,
				role: me.role,
			};
		}
	}

	// Fall back to the user's first org (no active set yet).
	const list = await auth.api.listOrganizations({ headers });
	const first = list[0];
	if (!first) {
		throw new ConvexError(
			"No organization: user must belong to at least one organization",
		);
	}
	const memberList = await auth.api.listMembers({
		headers,
		query: { organizationId: first.id },
	});
	const me = memberList.members.find(
		(m: { userId: string }) => m.userId === user._id,
	);
	return {
		userId: user._id,
		organizationId: first.id,
		role: me?.role ?? "member",
	};
}

/**
 * Assert the caller has a membership. Returns the membership details.
 */
export async function requireMembership(ctx: Ctx): Promise<Member> {
	return getActiveMembership(ctx);
}

/**
 * Assert the caller has a membership with one of the allowed roles.
 */
export async function requireRole(
	ctx: Ctx,
	allowed: readonly Role[],
): Promise<Member> {
	const member = await requireMembership(ctx);
	if (!allowed.includes(member.role as Role)) {
		throw new ConvexError(
			`Forbidden: requires one of [${allowed.join(", ")}], have ${member.role}`,
		);
	}
	return member;
}

/**
 * Assert the caller has membership in the given organization. Use this
 * when you've already fetched a tenant-scoped row and need to confirm
 * the caller is allowed to read/write it.
 */
export async function assertOrgMember(
	ctx: Ctx,
	organizationId: OrganizationId,
): Promise<Member> {
	const member = await requireMembership(ctx);
	if (member.organizationId !== organizationId) {
		throw new ConvexError(
			`Forbidden: not a member of organization ${organizationId}`,
		);
	}
	return member;
}
