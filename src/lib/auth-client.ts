import { createAuthClient } from "better-auth/react";
import { createAuthClient as createAuthClientWithPlugins } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";
import { ac, roles } from "../../convex/authz";

// Provider-facing client: a plain React auth client with the org plugin
// and nothing else. The ConvexBetterAuthProvider accepts a plain
// AuthClient shape; crossDomain/convex plugins break the useSession
// contract so they live on a separate client (see auth-convex.ts).
export const authClient = createAuthClient({
	plugins: [
		organizationClient({
			ac,
			roles,
		}),
	],
});

// Convex-side bridge: created once, used to wire the auth client's
// token fetcher into the Convex HTTP client. See __root.tsx for the
// beforeLoad that calls convexQueryClient.serverHttpClient?.setAuth.
export const authClientForConvex = createAuthClientWithPlugins({
	plugins: [
		organizationClient({
			ac,
			roles,
		}),
	],
});

export const { signIn, signOut, signUp, organization } = authClient;
