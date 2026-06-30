import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { organization } from "better-auth/plugins";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import authSchema from "./betterAuth/schema";
import authConfig from "./auth.config";
import { ac, roles } from "./authz";
import { sendTemplatedEmail } from "./lib/sendEmail";

export const authComponent = createClient<DataModel, typeof authSchema>(
	components.betterAuth,
	{
		local: { schema: authSchema },
	},
);

// Plugin tuple is declared at module scope (not inside a function return) so
// TypeScript infers it as a fixed-length tuple `[OrganizationPlugin,
// ConvexPlugin]`. Returning it from a function would widen to
// `BetterAuthPlugin[]` and break `auth.api` endpoint inference in callers.
const plugins = [
	organization({
		ac,
		roles,
		allowUserToCreateOrganization: true,
		// Real SES send via the shared lib/sendEmail helper. If SES is not
		// configured (missing AWS_REGION / AWS_ACCESS_KEY_ID / etc.), the
		// helper logs + returns "skipped" — the invite still gets created
		// in the DB so the inviter can resend manually. This callback is
		// invoked from Better Auth's HTTP path, not a Convex action, so
		// we use `fetch` directly (no `"use node"` directive).
		sendInvitationEmail: async (data: {
			id: string;
			email: string;
			organization: { name: string };
		}) => {
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
			const bodyHtml =
				`<p>${data.email},</p>` +
				`<p>You've been invited to join <strong>${orgName}</strong> on guides-tours.</p>` +
				`<p><a href="${inviteLink}">Accept the invitation</a></p>` +
				`<p>If you weren't expecting this email, you can safely ignore it.</p>`;

			const result = await sendTemplatedEmail({
				to: data.email,
				subject,
				bodyText,
				bodyHtml,
			});
			if (result.status === "failed") {
				// Log but don't throw — Better Auth treats thrown errors as
				// invitation failures and the row is harder to recover.
				// Operators can re-send via the dashboard.
				console.error(
					`[invite] SES send failed for ${data.email} (org=${orgName}): ${result.error}`,
				);
			}
		},
	}),
	convex({ authConfig }),
];

// Site URL resolution is lazy and falls back to localhost so module-load
// doesn't throw at Convex push-time (when both the static
// `convex/betterAuth/auth.ts` and `convex/betterAuth/adapter.ts` evaluate
// createAuth/createAuthOptions for the schema generator). At HTTP request
// time, an unset SITE_URL will cause Better Auth to misbehave — callers
// must set it on the Convex dashboard for production.
function getSiteUrl(): string {
	return process.env.SITE_URL ?? "http://localhost:3000";
}

// Returns BetterAuthOptions for components that need the raw config
// (e.g. `convex/betterAuth/adapter.ts`'s `createApi(schema, ...)`).
// TypeScript widens the plugin tuple through this annotation; `createAuth`
// below passes the tuple inline to preserve full plugin inference.
export const createAuthOptions = (
	ctx: GenericCtx<DataModel>,
): BetterAuthOptions => ({
	baseURL: getSiteUrl(),
	database: authComponent.adapter(ctx),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
	},
	plugins: [...plugins],
});

// Options are passed inline as a literal so TypeScript can infer the full
// plugin tuple on the returned `Auth<>` type — callers can then call
// `auth.api.listMembers`, `auth.api.listOrganizations`, etc.
export const createAuth = (ctx: GenericCtx<DataModel>) =>
	betterAuth({
		baseURL: getSiteUrl(),
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
		},
		user: {
			additionalFields: {
				phone: { type: "string", required: false, defaultValue: "" },
				bio: { type: "string", required: false, defaultValue: "" },
				photoUrl: { type: "string", required: false, defaultValue: "" },
				vacationDays: {
					type: "number",
					required: false,
					defaultValue: 20,
				},
				vacationDaysUsed: {
					type: "number",
					required: false,
					defaultValue: 0,
				},
				isActive: { type: "boolean", required: false, defaultValue: true },
			},
		},
		plugins,
	});

export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		return await authComponent.getAuthUser(ctx);
	},
});