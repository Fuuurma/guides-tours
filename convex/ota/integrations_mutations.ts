// OTA integration mutations.
//
// Split from convex/ota/integrations.ts (which is read-only queries)
// so admin writes can do per-field RBAC + encryption, while webhook
// handlers stay read-only.

import { v, ConvexError } from "convex/values";
import { internalMutation, mutation } from "../_generated/server";
import { requireRole } from "../lib/authz";
import { decrypt, encrypt } from "../lib/crypto";

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
			internal.createInternal as unknown as Parameters<
				typeof ctx.runMutation
			>[0],
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
			internal.updateInternal as unknown as Parameters<
				typeof ctx.runMutation
			>[0],
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
			internal.removeInternal as unknown as Parameters<
				typeof ctx.runMutation
			>[0],
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
		return await ctx.db.insert("otaIntegrations", {
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
		return args.integrationId;
	},
});

/**
 * Internal helper: read an integration with decrypted secrets.
 * Used by OTA client code (e.g. ViatorClient) so callers don't have
 * to deal with the decrypt dance. Tenant-scope is enforced at
 * the caller.
 */
export const getDecrypted = internalMutation({
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
