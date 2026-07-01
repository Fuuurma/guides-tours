import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, roles } from "../../convex/authz";

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
		organizationClient({
			ac,
			roles,
		}),
	],
});

export const { signIn, signOut, signUp } = authClient;
export const { organization } = authClient;
