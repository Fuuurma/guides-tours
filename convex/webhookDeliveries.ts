// Webhook delivery log helpers.
//
// Records every webhook received from any provider (OTA or Stripe).
// Used for:
//   - Idempotency: skip processing if the same eventId has been
//     seen (webhooks retry on failure)
//   - Audit: who/when/what for every webhook
//   - Replay: re-trigger processing of failed webhooks from admin
//
// Called from the OTA webhook_handler.ts factory and the
// stripeWebhook httpAction in payments_stripe_actions.ts.
// Both call sites catch recordDelivery failures so a DB hiccup
// doesn't block the actual webhook dispatch.

import { v, ConvexError } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Record a webhook delivery. Idempotent on (source, eventId) — if a
 * row with the same key already exists, returns the existing row's id
 * without modifying it. The caller can then decide whether to skip
 * processing ("duplicate eventId") or update the existing row.
 */
export const recordDelivery = internalMutation({
	args: {
		organizationId: v.string(),
		source: v.string(),
		eventId: v.string(),
		eventType: v.string(),
		integrationId: v.optional(v.id("otaIntegrations")),
		ipAddress: v.optional(v.string()),
		userAgent: v.optional(v.string()),
		payload: v.any(),
		attemptCount: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("webhookDeliveries")
			.withIndex("by_source_event", (q) =>
				q.eq("source", args.source).eq("eventId", args.eventId),
			)
			.first();
		if (existing) {
			return { id: existing._id, isDuplicate: true };
		}
		const now = Date.now();
		const id = await ctx.db.insert("webhookDeliveries", {
			organizationId: args.organizationId,
			source: args.source,
			eventId: args.eventId,
			eventType: args.eventType,
			status: "received",
			integrationId: args.integrationId,
			ipAddress: args.ipAddress,
			userAgent: args.userAgent,
			payload: args.payload,
			attemptCount: args.attemptCount ?? 1,
			receivedAt: now,
		});
		return { id, isDuplicate: false };
	},
});

/**
 * Update a webhook delivery status (e.g. after processing completes).
 * Idempotent on (source, eventId) — finds the existing row.
 */
export const updateDeliveryStatus = internalMutation({
	args: {
		source: v.string(),
		eventId: v.string(),
		status: v.union(
			v.literal("received"),
			v.literal("processing"),
			v.literal("processed"),
			v.literal("failed"),
			v.literal("skipped"),
		),
		processedResourceId: v.optional(v.string()),
		skipReason: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("webhookDeliveries")
			.withIndex("by_source_event", (q) =>
				q.eq("source", args.source).eq("eventId", args.eventId),
			)
			.first();
		if (!existing) {
			throw new ConvexError(
				`No webhook delivery found for ${args.source} event ${args.eventId}`,
			);
		}
		const now = Date.now();
		const patch: Record<string, unknown> = { status: args.status };
		if (args.processedResourceId !== undefined) {
			patch.processedResourceId = args.processedResourceId;
		}
		if (args.skipReason !== undefined) {
			patch.skipReason = args.skipReason;
		}
		if (args.errorMessage !== undefined) {
			patch.errorMessage = args.errorMessage;
		}
		if (args.status === "processed" || args.status === "failed") {
			patch.processedAt = now;
		}
		await ctx.db.patch(existing._id, patch);
		return existing._id;
	},
});

/**
 * List deliveries for an org. Used by admin tooling to audit webhook
 * health and replay failed ones.
 */
export const listByOrg = internalQuery({
	args: {
		organizationId: v.string(),
		status: v.optional(
			v.union(
				v.literal("received"),
				v.literal("processing"),
				v.literal("processed"),
				v.literal("failed"),
				v.literal("skipped"),
			),
		),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = Math.min(args.limit ?? 50, 500);
		const status = args.status;
		const all = status
			? await ctx.db
					.query("webhookDeliveries")
					.withIndex("by_org_status", (q) =>
						q.eq("organizationId", args.organizationId).eq("status", status),
					)
					.collect()
			: await ctx.db
					.query("webhookDeliveries")
					.withIndex("by_org", (q) =>
						q.eq("organizationId", args.organizationId),
					)
					.collect();
		return all
			.sort((a, b) => b.receivedAt - a.receivedAt)
			.slice(0, limit);
	},
});
