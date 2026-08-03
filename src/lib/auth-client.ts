import {
	convexClient,
	crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, roles } from "../../convex/authz";

// crossDomainClient is only needed for OAuth state, but it forces
// `credentials: "omit"` and sends the session via the `Better-Auth-Cookie`
// header, which makes the server-side crossDomain plugin convert
// `set-cookie` → `Set-Better-Auth-Cookie` (a header, not a cookie). The
// browser then never stores the session, so sign-up → onboarding →
// dashboard breaks (org create 401s, SSR guard bounces).
//
// This app uses a same-origin proxy (src/routes/api/auth/$.ts → Convex),
// so auth cookies are first-party and must be stored as real browser
// cookies — the SSR `getToken` guard and Convex's `/convex/token` endpoint
// both read the session cookie. This fetch plugin restores native cookie
// handling: it removes the `Better-Auth-Cookie` header (so the server
// keeps `set-cookie`) and re-enables `credentials: "include"` (so the
// browser stores it).
const sameOriginCookiePlugin = {
	id: "same-origin-cookie",
	name: "Same Origin Cookie",
	fetchPlugins: [
		{
			id: "same-origin-cookie",
			name: "Same Origin Cookie",
			hooks: {
				onRequest: async (context: {
					headers: Headers;
					credentials?: RequestCredentials;
				}) => {
					context.headers.delete("Better-Auth-Cookie");
					context.credentials = "include";
				},
			},
		},
	],
} as unknown as ReturnType<typeof crossDomainClient>;

// ConvexBetterAuthProvider requires a client with BOTH `convexClient()`
// and `crossDomainClient()` (see @convex-dev/better-auth react/src/index.ts:
// useUseAuthFromBetterAuth calls `authClient.convex.token(...)` and
// `authClient.crossDomain.oneTimeToken.verify(...)`). The org plugin
// is the product-specific one for multi-tenant organizations.
//
// Type note: the AuthClient type in @convex-dev/better-auth 0.12.5 is a
// discriminated union; our client satisfies `PluginsWithCrossDomain` but
// the type narrows `useSession().data` to `never` which fails structural
// assignment in `__root.tsx`. We cast there with a `biome-ignore` reason.
export const authClient = createAuthClient({
	plugins: [
		convexClient(),
		crossDomainClient(),
		sameOriginCookiePlugin,
		organizationClient({
			ac,
			roles,
		}),
	],
});

export const { signIn, signOut, signUp } = authClient;
export const { organization } = authClient;
