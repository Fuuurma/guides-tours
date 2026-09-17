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
