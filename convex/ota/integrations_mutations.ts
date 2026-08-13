// OTA integration mutations.
//
// Split from convex/ota/integrations.ts (which is read-only queries)
// so admin writes can do per-field RBAC + encryption, while webhook
// handlers stay read-only.

import { v, ConvexError } from "convex/values";
import type { FunctionReference } from "convex/server";
import { internalMutation, internalQuery, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireRole } from "../lib/authz";
import { decrypt, encrypt } from "../lib/crypto";
import { logAudit } from "../lib/audit";
import { assertFieldWithinLimit } from "../lib/validation";

type InternalMutationRef = FunctionReference<"mutation", "internal">;
const internalRefs = internal as unknown as {
	ota: {
		integrations_mutations: Record<string, InternalMutationRef>;
	};
};

const PROVIDERS = [
	"viator",
	"getyourguide",
	"airbnb",
	"tripadvisor",
	"klook",
	"booking",
	"expedia",
] as const;

// ----- Public mutations (with authz) -----

export const create = mutation({
	args: {
		provider: v.string(),
		apiKey: v.string(),
		apiSecret: v.optional(v.string()),
		partnerId: v.optional(v.string()),
		apiEndpoint: v.optional(v.string()),
		isSandbox: v.boolean(),
		webhookSecret: v.optional(v.string()),
		autoSyncAvailability: v.optional(v.boolean()),
		autoSyncPricing: v.optional(v.boolean()),
		syncIntervalMinutes: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRefs.ota.integrations_mutations.createInternal,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				...args,
			},
		);
	},
});

export const update = mutation({
	args: {
		integrationId: v.id("otaIntegrations"),
		apiKey: v.optional(v.string()),
		apiSecret: v.optional(v.string()),
		partnerId: v.optional(v.string()),
		apiEndpoint: v.optional(v.string()),
		isActive: v.optional(v.boolean()),
		isSandbox: v.optional(v.boolean()),
		webhookSecret: v.optional(v.string()),
		autoSyncAvailability: v.optional(v.boolean()),
		autoSyncPricing: v.optional(v.boolean()),
		syncIntervalMinutes: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRefs.ota.integrations_mutations.updateInternal,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				...args,
			},
		);
	},
});

export const remove = mutation({
	args: { integrationId: v.id("otaIntegrations") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRefs.ota.integrations_mutations.removeInternal,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				integrationId: args.integrationId,
			},
		);
	},
});

// ----- Internal mutations (no auth, for tests + internal callers) -----

export const createInternal = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		provider: v.string(),
		apiKey: v.string(),
		apiSecret: v.optional(v.string()),
		partnerId: v.optional(v.string()),
		apiEndpoint: v.optional(v.string()),
		isSandbox: v.boolean(),
		webhookSecret: v.optional(v.string()),
		autoSyncAvailability: v.optional(v.boolean()),
		autoSyncPricing: v.optional(v.boolean()),
		syncIntervalMinutes: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		if (!PROVIDERS.includes(args.provider as (typeof PROVIDERS)[number])) {
			throw new ConvexError(
				`Unknown provider "${args.provider}". Supported: ${PROVIDERS.join(", ")}`,
			);
		}
		assertFieldWithinLimit("apiKey", args.apiKey, 500);
		if (args.apiSecret !== undefined) {
			assertFieldWithinLimit("apiSecret", args.apiSecret, 500);
		}
		if (args.webhookSecret !== undefined) {
			assertFieldWithinLimit("webhookSecret", args.webhookSecret, 500);
		}
		if (args.partnerId !== undefined) {
			assertFieldWithinLimit("partnerId", args.partnerId, 100);
		}
		if (args.apiEndpoint !== undefined) {
			assertFieldWithinLimit("apiEndpoint", args.apiEndpoint, 500);
		}

		const existing = await ctx.db
			.query("otaIntegrations")
			.withIndex("by_org_provider", (q) =>
				q
					.eq("organizationId", args.organizationId)
					.eq("provider", args.provider),
			)
			.unique();
		if (existing) {
			throw new ConvexError(
				`Integration for ${args.provider} already exists. Update it instead.`,
			);
		}

		const encKey = await encrypt(args.apiKey);
		const encSecret = args.apiSecret
			? await encrypt(args.apiSecret)
			: undefined;
		const encWebhook = args.webhookSecret
			? await encrypt(args.webhookSecret)
			: undefined;

		const now = Date.now();
		const integrationId = await ctx.db.insert("otaIntegrations", {
			organizationId: args.organizationId,
			provider: args.provider,
			apiKey: encKey,
			apiSecret: encSecret,
			partnerId: args.partnerId,
			apiEndpoint: args.apiEndpoint,
			isActive: true,
			isSandbox: args.isSandbox,
			webhookSecret: encWebhook,
			webhookUrl: undefined,
			autoSyncAvailability: args.autoSyncAvailability ?? false,
			autoSyncPricing: args.autoSyncPricing ?? false,
			syncIntervalMinutes: args.syncIntervalMinutes ?? 60,
			lastSyncAt: undefined,
			lastSyncStatus: undefined,
			lastSyncError: undefined,
			settings: {},
			createdAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "ota_integration.created",
			resourceType: "otaIntegration",
			resourceId: integrationId,
			oldValues: {},
			// Don't log encrypted secrets — log only non-sensitive config.
			newValues: {
				provider: args.provider,
				isSandbox: args.isSandbox,
				autoSyncAvailability: args.autoSyncAvailability ?? false,
				autoSyncPricing: args.autoSyncPricing ?? false,
				syncIntervalMinutes: args.syncIntervalMinutes ?? 60,
			},
		});
		return integrationId;
	},
});

export const updateInternal = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		integrationId: v.id("otaIntegrations"),
		apiKey: v.optional(v.string()),
		apiSecret: v.optional(v.string()),
		partnerId: v.optional(v.string()),
		apiEndpoint: v.optional(v.string()),
		isActive: v.optional(v.boolean()),
		isSandbox: v.optional(v.boolean()),
		webhookSecret: v.optional(v.string()),
		autoSyncAvailability: v.optional(v.boolean()),
		autoSyncPricing: v.optional(v.boolean()),
		syncIntervalMinutes: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.integrationId);
		if (!row) throw new ConvexError("Integration not found");
		if (row.organizationId !== args.organizationId) {
			throw new ConvexError(
				"Forbidden: integration belongs to a different organization",
			);
		}

		if (args.apiKey !== undefined) {
			assertFieldWithinLimit("apiKey", args.apiKey, 500);
		}
		if (args.apiSecret !== undefined) {
			assertFieldWithinLimit("apiSecret", args.apiSecret, 500);
		}
		if (args.webhookSecret !== undefined) {
			assertFieldWithinLimit("webhookSecret", args.webhookSecret, 500);
		}
		if (args.partnerId !== undefined) {
			assertFieldWithinLimit("partnerId", args.partnerId, 100);
		}
		if (args.apiEndpoint !== undefined) {
			assertFieldWithinLimit("apiEndpoint", args.apiEndpoint, 500);
		}

		const patch: Record<string, unknown> = { updatedAt: Date.now() };

		if (args.apiKey !== undefined) {
			patch.apiKey = await encrypt(args.apiKey);
		}
		if (args.apiSecret !== undefined) {
			patch.apiSecret = await encrypt(args.apiSecret);
		}
		if (args.webhookSecret !== undefined) {
			patch.webhookSecret = await encrypt(args.webhookSecret);
		}
		if (args.partnerId !== undefined) patch.partnerId = args.partnerId;
		if (args.apiEndpoint !== undefined) patch.apiEndpoint = args.apiEndpoint;
		if (args.isActive !== undefined) patch.isActive = args.isActive;
		if (args.isSandbox !== undefined) patch.isSandbox = args.isSandbox;
		if (args.autoSyncAvailability !== undefined) {
			patch.autoSyncAvailability = args.autoSyncAvailability;
		}
		if (args.autoSyncPricing !== undefined) {
			patch.autoSyncPricing = args.autoSyncPricing;
		}
		if (args.syncIntervalMinutes !== undefined) {
			patch.syncIntervalMinutes = args.syncIntervalMinutes;
		}

		await ctx.db.patch(args.integrationId, patch);
		// Build oldValues for every changed field (strip secrets + updatedAt).
		const SECRET_FIELDS = new Set(["apiKey", "apiSecret", "webhookSecret"]);
		const oldValues: Record<string, unknown> = {};
		const newValues: Record<string, unknown> = {};
		for (const key of Object.keys(patch)) {
			if (key === "updatedAt") continue;
			if (SECRET_FIELDS.has(key)) {
				oldValues[key] = "[REDACTED]";
				newValues[key] = "[REDACTED]";
			} else {
				oldValues[key] = (row as Record<string, unknown>)[key];
				newValues[key] = patch[key];
			}
		}
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "ota_integration.updated",
			resourceType: "otaIntegration",
			resourceId: args.integrationId,
			oldValues,
			newValues,
		});
		return args.integrationId;
	},
});

export const removeInternal = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		integrationId: v.id("otaIntegrations"),
	},
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.integrationId);
		if (!row) throw new ConvexError("Integration not found");
		if (row.organizationId !== args.organizationId) {
			throw new ConvexError(
				"Forbidden: integration belongs to a different organization",
			);
		}
		await ctx.db.patch(args.integrationId, {
			isActive: false,
			updatedAt: Date.now(),
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "ota_integration.deleted",
			resourceType: "otaIntegration",
			resourceId: args.integrationId,
			oldValues: {
				provider: row.provider,
				isActive: row.isActive,
			},
			newValues: { isActive: false },
		});
		return args.integrationId;
	},
});

/**
 * Internal helper: read an integration with decrypted secrets.
 * Used by OTA client code (e.g. ViatorClient) so callers don't have
 * to deal with the decrypt dance. Tenant-scope is enforced at
 * the caller.
 *
 * Registered as internalQuery (not internalMutation) because it only
 * reads — using a mutation for a read-only operation runs it as a
 * transaction unnecessarily and prevents reactive caching.
 */
export const getDecrypted = internalQuery({
	args: { integrationId: v.id("otaIntegrations") },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.integrationId);
		if (!row) return null;
		return {
			organizationId: row.organizationId,
			provider: row.provider,
			isActive: row.isActive,
			isSandbox: row.isSandbox,
			apiKey: await decrypt(row.apiKey),
			apiSecret: row.apiSecret ? await decrypt(row.apiSecret) : undefined,
			webhookSecret: row.webhookSecret
				? await decrypt(row.webhookSecret)
				: undefined,
		};
	},
});
