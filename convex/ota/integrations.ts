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
 *
 * Strips `webhookSecret` and `apiSecret` from the response so they
 * never leak to the client. The FE never needs to see these —
 * write paths (create/update) accept them via the user typing them
 * in; read paths never round-trip them. The webhook handler reads
 * via the internal `getForWebhook` query above.
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const member = await requireMembership(ctx);
		// Bound the result so an org with thousands of OTA integrations
		// doesn't OOM the response. The FE page renders at most a
		// few dozen.
		const MAX_INTEGRATIONS = 50;
		const rows = await ctx.db
			.query("otaIntegrations")
			.withIndex("by_org", (q) => q.eq("organizationId", member.organizationId))
			.take(MAX_INTEGRATIONS);
		return rows.map(stripSecrets);
	},
});

/**
 * Single-integration lookup for the admin UI. Tenant-scoped.
 * Strips secrets — see `list` for rationale.
 */
export const get = query({
	args: { integrationId: v.id("otaIntegrations") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const row = await ctx.db.get(args.integrationId);
		if (!row || row.organizationId !== member.organizationId) return null;
		return stripSecrets(row);
	},
});

/**
 * Strip webhook/API secret fields from an OTA integration row
 * before returning it to the client. These secrets are write-only
 * from the FE perspective; the server-side webhook handler reads
 * them via `getForWebhook` (internal).
 */
function stripSecrets<T extends { webhookSecret?: string; apiSecret?: string }>(
	row: T,
): Omit<T, "webhookSecret" | "apiSecret"> {
	const { webhookSecret: _ws, apiSecret: _as, ...safe } = row;
	void _ws;
	void _as;
	return safe;
}

