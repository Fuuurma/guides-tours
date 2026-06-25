import { betterAuth } from "better-auth/minimal";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { organization } from "better-auth/plugins";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL;
if (!siteUrl) {
	throw new Error("SITE_URL must be set in the Convex dashboard");
}

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	return betterAuth({
		baseURL: siteUrl,
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
		},
		plugins: [
			// Organization plugin — replaces the Django `Company` model.
			// Tables added: organization, member, invitation.
			// Active organization is tracked on the session table.
			organization({
				// Allow any signed-in user to create their first org.
				// Phase 4 may tighten this (e.g. require email verification).
				allowUserToCreateOrganization: true,
			}),
			convex({ authConfig }),
		],
	});
};

export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		return await authComponent.getAuthUser(ctx);
	},
});

// Get the user's active organization. Returns null if none set.
export const getActiveOrganization = query({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;
		// The active organization id is stored on the session, accessible
		// via auth.api. For now we return the first org membership.
		// Phase 4 will switch to active-organization tracking via
		// setActiveOrganization.
		const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
		const list = await auth.api.listOrganizations({ headers });
		return list[0] ?? null;
	},
});
