import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { organization } from "better-auth/plugins";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import authSchema from "./betterAuth/schema";
import authConfig from "./auth.config";
import { ac, roles } from "./authz";
import { sendTemplatedEmail } from "./lib/sendEmail";
import { sendInvitationEmail } from "./lib/inviteEmail";
import { getSiteUrl } from "./lib/siteUrl";

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
		requireEmailVerificationOnInvitation: true,
		// Real SES send via the shared lib/sendEmail helper — extracted to
		// convex/lib/inviteEmail.ts. Delivery is best-effort: failed/skipped
		// results are logged, never thrown (Better Auth swallows callback
		// errors anyway), so the invite row survives for manual resend and
		// the client can never confirm delivery — UI must not claim it.
		sendInvitationEmail,
	}),
	convex({ authConfig }),
	crossDomain({ siteUrl: getSiteUrl() }),
];

// Site URL resolution is lazy and falls back to localhost so module-load
// doesn't throw at Convex push-time (when both the static
// `convex/betterAuth/auth.ts` and `convex/betterAuth/adapter.ts` evaluate
// createAuth/createAuthOptions for the schema generator). At HTTP request
// time, an unset SITE_URL will cause Better Auth to misbehave — callers
// must set it on the Convex dashboard for production. The shared
// lib/siteUrl getSiteUrl owns the degraded-not-dead policy (localhost
// fallback + once-per-isolate logger.error on configured deployments);
// auth.ts deliberately uses it rather than a second private copy.

// Local dev detection — mirrors restaurant-calendar, but only when
// SITE_URL is explicitly set to a local URL. Missing SITE_URL must not
// silently inherit getSiteUrl()'s localhost fallback, because that would
// disable email verification on a misconfigured production deployment.
// In production the site URL is the deployed domain, so verification is
// required — this preserves the pre-registration-attack protection from
// audit fix #112 (GHSA-FMH4-WCC4-5JM3).
function isLocalDev(): boolean {
	const siteUrl = process.env.SITE_URL;
	if (!siteUrl) return false;
	return (
		siteUrl.includes("127.0.0.1") || siteUrl.includes("localhost")
	);
}

function googleSocialProviders():
	| Record<string, { clientId: string; clientSecret: string }>
	| Record<string, never> {
	const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
	const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
	if (!clientId || !clientSecret) return {};
	return {
		google: {
			clientId,
			clientSecret,
		},
	};
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
		// Local dev skips email verification so sign-up auto-signs-in and
		// the onboarding flow works without SES. Production requires it.
		requireEmailVerification: isLocalDev() ? false : true,
		minPasswordLength: 8,
		sendResetPassword: async ({ user, url }) => {
			await sendTemplatedEmail({
				to: user.email,
				subject: "Reset your password on guides-tours",
				bodyText: `Click the link below to reset your password:\n${url}\n\nIf you didn't request this, you can safely ignore this email.`,
				bodyHtml: `<p>Click the link below to reset your password:</p><p><a href="${url}">Reset password</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
			});
		},
	},
	emailVerification: {
		// After a user verifies via the emailed link, sign them in
		// automatically (production flow).
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			await sendTemplatedEmail({
				to: user.email,
				subject: "Verify your email on guides-tours",
				bodyText: `Click the link below to verify your email:\n${url}\n\nIf you didn't create an account, you can safely ignore this email.`,
				bodyHtml: `<p>Click the link below to verify your email:</p><p><a href="${url}">Verify email</a></p><p>If you didn't create an account, you can safely ignore this email.</p>`,
			});
		},
	},
	socialProviders: googleSocialProviders(),
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
			// Local dev skips email verification so sign-up auto-signs-in
			// and the onboarding flow works without SES. Production
			// requires it.
			requireEmailVerification: isLocalDev() ? false : true,
			minPasswordLength: 8,
			sendResetPassword: async ({ user, url }) => {
				await sendTemplatedEmail({
					to: user.email,
					subject: "Reset your password on guides-tours",
					bodyText: `Click the link below to reset your password:\n${url}\n\nIf you didn't request this, you can safely ignore this email.`,
					bodyHtml: `<p>Click the link below to reset your password:</p><p><a href="${url}">Reset password</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
				});
			},
		},
		emailVerification: {
			// After a user verifies via the emailed link, sign them in
			// automatically (production flow).
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({ user, url }) => {
				await sendTemplatedEmail({
					to: user.email,
					subject: "Verify your email on guides-tours",
					bodyText: `Click the link below to verify your email:\n${url}\n\nIf you didn't create an account, you can safely ignore this email.`,
					bodyHtml: `<p>Click the link below to verify your email:</p><p><a href="${url}">Verify email</a></p><p>If you didn't create an account, you can safely ignore this email.</p>`,
				});
			},
		},
		socialProviders: googleSocialProviders(),
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
		return await authComponent.safeGetAuthUser(ctx);
	},
});

export const isGoogleEnabled = query({
	args: {},
	handler: async () => {
		return Boolean(
			process.env.GOOGLE_CLIENT_ID?.trim() &&
				process.env.GOOGLE_CLIENT_SECRET?.trim(),
		);
	},
});
