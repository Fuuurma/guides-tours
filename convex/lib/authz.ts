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
// Single-org users fall back to their only membership (back-compat).
// Multi-org users WITHOUT an active org fail closed — silently defaulting
// to the "first" org risks cross-tenant writes. The client must call
// setActiveOrganization (org switcher / sign-in / auth callback).

import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { authComponent, createAuth } from "../auth";
import { roles, type RoleName } from "../authz";

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
 * Single-org users fall back to their only membership. Multi-org users
 * without an active org throw — failing closed so a write can never
 * silently land in the wrong tenant. Throws if the user has no
 * organization at all.
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

	// No active org set: single-org users keep the back-compat fallback
	// to their only membership. Multi-org users fail closed — silently
	// defaulting to the "first" org risks cross-tenant writes, so force
	// an explicit choice via setActiveOrganization instead.
	const list = await auth.api.listOrganizations({ headers });
	const first = list[0];
	if (!first) {
		throw new ConvexError(
			"No organization: user must belong to at least one organization",
		);
	}
	if (list.length > 1) {
		throw new ConvexError(
			"No active organization: call setActiveOrganization to choose which organization to operate on",
		);
	}
	const memberList = await auth.api.listMembers({
		headers,
		query: { organizationId: first.id },
	});
	const me = memberList.members.find(
		(m: { userId: string }) => m.userId === user._id,
	);
	if (!me) {
		// listOrganizations should only return orgs the user is a
		// member of, so this should never happen. If it does, it
		// indicates a data inconsistency (org exists but no member
		// row for this user). Defaulting to "member" would silently
		// grant access — throw instead so the inconsistency is
		// visible and the user is not granted unintended permissions.
		throw new ConvexError(
			`User ${user._id} is not a member of organization ${first.id} (data inconsistency — contact admin)`,
		);
	}
	return {
		userId: user._id,
		organizationId: first.id,
		role: me.role,
	};
}

/**
 * Assert the caller has a membership. Returns the membership details.
 */
export async function requireMembership(ctx: Ctx): Promise<Member> {
	return getActiveMembership(ctx);
}

/**
 * FO-02 follow-up / devin 09-01 P1: enforce the DECLARED per-resource
 * RBAC statements (convex/authz.ts) instead of coarse role lists.
 *
 * Resolves the caller's membership, then checks the role's declared
 * statements for `resource:action` via the Better Auth access-control
 * `authorize`. Throws ConvexError on denial with role/resource/action.
 *
 * NOTE: this is the enforcement path for the declared config — to change
 * who may do what, edit the statements/roles in authz.ts, not the callers.
 */
export async function requirePermission(
  ctx: Ctx,
  resource: string,
  action: string,
): Promise<Member> {
  const member = await requireMembership(ctx);
  const role = roles[member.role as RoleName];
  if (!role) {
    throw new ConvexError(`Forbidden: unknown role "${member.role}"`);
  }
  const verdict = role.authorize({ [resource]: [action] });
  if (!verdict.success) {
    throw new ConvexError(
      `Forbidden: role "${member.role}" lacks ${action} on ${resource}`,
    );
  }
  return member;
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
