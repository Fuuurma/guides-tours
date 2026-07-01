import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, roles } from "../../convex/authz";

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
