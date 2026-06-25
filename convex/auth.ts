import { betterAuth } from "better-auth/minimal";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { organization } from "better-auth/plugins";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { ac, roles } from "./authz";

const siteUrl = process.env.SITE_URL;
if (!siteUrl) {
	throw new Error("SITE_URL must be set in the Convex dashboard");
}

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
	betterAuth({
		baseURL: siteUrl,
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
		plugins: [
			organization({
				ac,
				roles,
				allowUserToCreateOrganization: true,
				// Stub: logs to console. Phase 7 wires Amazon SES.
				sendInvitationEmail: async (data) => {
					const inviteLink = `${siteUrl}/invite/${data.id}`;
					console.log(
						`[invite-stub] would email ${data.email} link=${inviteLink} org=${data.organization.name}`,
					);
				},
			}),
			convex({ authConfig }),
		],
	});

export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		return await authComponent.getAuthUser(ctx);
	},
});
