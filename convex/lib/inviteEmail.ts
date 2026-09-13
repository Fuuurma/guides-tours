// Invitation email sender for the Better Auth `organization` plugin.
//
// Extracted from convex/auth.ts so the behavior can be unit-tested
// directly (convex/lib/__tests__/inviteEmail.test.ts).
//
// Delivery contract (documented design — see F70 review note):
//   - Real SES send via the shared lib/sendEmail helper. If SES is not
//     configured (missing AWS_REGION / AWS_ACCESS_KEY_ID / etc.), the
//     helper logs + returns "skipped" — the invite still gets created
//     in the DB so the inviter can resend manually.
//   - On "failed" or "skipped" results we log but never throw: Better
//     Auth runs this via runInBackgroundOrAwait, which swallows errors
//     anyway, so throwing can never reach the client — it would only
//     make the invitation row harder to recover. Operators re-send via
//     the dashboard pending-invites list.
//   - The client therefore CANNOT observe delivery status through
//     inviteMember; UI copy must never claim the email was sent.
//   - This callback is invoked from Better Auth's HTTP path, not a
//     Convex action, so we use `fetch` directly (no `"use node"`).

import { sendTemplatedEmail } from "./sendEmail";
import { logger } from "./logger";

export type InvitationEmailData = {
	id: string;
	email: string;
	organization: { name: string };
};

export async function sendInvitationEmail(
	data: InvitationEmailData,
): Promise<void> {
	const siteUrl = process.env.SITE_URL;
	if (!siteUrl) {
		throw new Error("SITE_URL must be set in the Convex dashboard");
	}
	const inviteLink = `${siteUrl}/invite/${data.id}`;
	const orgName = data.organization.name;
	const subject = `You've been invited to join ${orgName} on guides-tours`;
	const bodyText =
		`${data.email},\n\n` +
		`You've been invited to join ${orgName} on guides-tours.\n\n` +
		`Accept the invitation here:\n${inviteLink}\n\n` +
		`If you weren't expecting this email, you can safely ignore it.`;
	// HTML-escape user-provided fields to prevent XSS in email clients.
	const escHtml = (s: string) =>
		s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
		 .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
	const bodyHtml =
		`<p>${escHtml(data.email)},</p>` +
		`<p>You've been invited to join <strong>${escHtml(orgName)}</strong> on guides-tours.</p>` +
		`<p><a href="${inviteLink}">Accept the invitation</a></p>` +
		`<p>If you weren't expecting this email, you can safely ignore it.</p>`;

	const result = await sendTemplatedEmail({
		to: data.email,
		subject,
		bodyText,
		bodyHtml,
	});
	if (result.status === "failed") {
		logger.error(
			`[invite] SES send failed for ${data.email} (org=${orgName}): ${result.error}`,
		);
	}
}
