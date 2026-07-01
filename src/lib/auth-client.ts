import { createAuthClient } from "better-auth/react";
import { createAuthClient as createAuthClientWithPlugins } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";
import { crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { ac, roles } from "../../convex/authz";

// Plain React client for the provider — no Convex plugin, since the
// provider expects a vanilla `AuthClient`. Mirrors the pattern in
// churn-recovery/apps/web/src/lib/auth-client.ts.
export const authClient = createAuthClient({
	plugins: [
		// crossDomainClient is what ConvexBetterAuthProvider expects — it
		// makes the provider shape work with a `useSession` that's aware
		// of cross-domain cookie state.
		crossDomainClient(),
	],
});

// Full client with the org plugin for signIn/signUp/signOut/etc.
// that the app's auth UI uses.
export const authUi = createAuthClientWithPlugins({
	plugins: [
		organizationClient({
			ac,
			roles,
		}),
	],
});

export const { signIn, signOut, signUp } = authUi;
export const { organization } = authUi;
