import { authClient } from "@/lib/auth-client";

// Pending-invitation helpers shared by the dashboard invites UI.
//
// Why these exist: Better Auth's resend path (`findPendingInvitation`)
// only matches invitations whose `expiresAt` is still in the future, so
// calling `inviteMember({ resend: true })` on an EXPIRED row silently
// falls through to `createInvitation` — leaving the stale row in the
// pending list plus a brand-new duplicate for the same email. The UI
// therefore has to cancel expired same-email rows before resending so a
// resend always ends with exactly one pending invitation per email.

export type InviteLike = {
	id: string;
	email: string;
	expiresAt?: Date | string | number | null;
};

// An invitation counts as expired when it has no usable `expiresAt` or
// it is already in the past. Missing/invalid values are treated as
// expired on purpose: Better Auth's expiry filter
// (`new Date(invite.expiresAt) > new Date()`) can never match them, so
// resend would create a duplicate — they are stale either way.
export function isInviteExpired(
	inv: InviteLike,
	now: number = Date.now(),
): boolean {
	if (inv.expiresAt === undefined || inv.expiresAt === null) return true;
	const t = new Date(inv.expiresAt).getTime();
	return Number.isNaN(t) || t <= now;
}

// Returns the ids that must be cancelled before `inviteMember` is called
// for `target`: every EXPIRED invitation with the same email (including
// `target` itself when expired). Live same-email rows are left alone —
// `resend: true` extends their expiry in place instead of duplicating.
export function planInvitationResend(
	invites: InviteLike[],
	target: InviteLike,
	now?: number,
): string[] {
	const email = target.email.toLowerCase();
	return invites
		.filter((i) => i.email.toLowerCase() === email && isInviteExpired(i, now))
		.map((i) => i.id);
}

// Result of accepting an org invitation for the freshly signed-in
// user. `orgs` is the post-accept org list so callers route exactly
// like the standard sign-in path (no org → /onboarding, otherwise the
// post-auth destination) instead of assuming the join succeeded.
export type AcceptInvitationResult =
	| { ok: true; orgs: { id: string }[] }
	| { ok: false; message: string };

// Accepts a pending org invitation, then applies the design step-1
// single-org pin so backend authz never falls back to "first org".
// Failure is returned, not thrown — both the sign-in form and the
// OAuth callback must surface it rather than navigating on regardless
// (an expired/mismatched invite must not silently land the user on
// /dashboard still unjoined).
export async function acceptInvitationForSession(
	invitationId: string,
): Promise<AcceptInvitationResult> {
	const accept = await authClient.organization.acceptInvitation({
		invitationId,
	});
	if (accept.error) {
		return {
			ok: false,
			message: accept.error.message ?? "Could not accept invitation",
		};
	}
	const { data: orgs } = await authClient.organization.list();
	const list = orgs ?? [];
	if (list.length === 1) {
		await authClient.organization.setActive({
			organizationId: list[0].id,
		});
	}
	return { ok: true, orgs: list };
}

// Where the Google sign-in button should land after OAuth. An
// invitationId must route through /auth/callback so the invite gets
// accepted once the session exists — sending the browser straight to
// the destination would drop the invite silently (F148).
export function googleCallbackUrl(opts: {
	invitationId?: string;
	redirect?: string;
	origin?: string;
}): string {
	const { invitationId, redirect, origin = "" } = opts;
	if (invitationId) {
		const params = new URLSearchParams({ invitationId });
		if (redirect) params.set("redirect", redirect);
		return `/auth/callback?${params.toString()}`;
	}
	if (redirect) return `${origin}${redirect}`;
	return "/dashboard";
}
