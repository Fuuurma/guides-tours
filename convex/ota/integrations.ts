// OTA integrations: read-side queries used by webhook handlers and
// the public OTA admin UI. Mutations (create / update / delete) live
// in convex/ota/integrations_mutations.ts so admin writes can have
// per-field RBAC checks while webhooks stay read-only.

import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { requireMembership } from "../lib/authz";

/**
 * Read-only fetch used by the webhook handlers. Returns the minimum
 * fields they need to verify the signature + dispatch the event.
 *
 * Intentionally internal — webhook handlers run as cron / external
 * callbacks, not user-initiated, so they don't have an authed
 * context.
 */
export const getForWebhook = internalQuery({
	args: { integrationId: v.id("otaIntegrations") },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.integrationId);
		if (!row) return null;
		return {
			organizationId: row.organizationId,
			provider: row.provider,
			isActive: row.isActive,
			webhookSecret: row.webhookSecret,
		};
	},
});

/**
 * Public list query for the OTA admin UI. Tenant-scoped via the
 * Better Auth org plugin.
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const member = await requireMembership(ctx);
		return await ctx.db
			.query("otaIntegrations")
			.withIndex("by_org", (q) => q.eq("organizationId", member.organizationId))
			.collect();
	},
});

/**
 * Single-integration lookup for the admin UI. Tenant-scoped.
 */
export const get = query({
	args: { integrationId: v.id("otaIntegrations") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const row = await ctx.db.get(args.integrationId);
		if (!row || row.organizationId !== member.organizationId) return null;
		return row;
	},
});

