// OTA products: link a tour to an OTA listing (Viator product, GYG
// activity, etc). Holds the OTA-side identifiers + sync status.
//
// Source: backend/tours/models.py::OTAProduct

import { v, ConvexError } from "convex/values";
import {
	query,
	mutation,
	internalMutation,
} from "./_generated/server";
import type { FunctionReference } from "convex/server";
import { requireMembership, requireRole } from "./lib/authz";

// ---- queries ----

export const list = query({
	args: {
		integrationId: v.optional(v.id("otaIntegrations")),
		tourId: v.optional(v.id("tours")),
		syncStatus: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		let q = ctx.db
			.query("otaProducts")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId));
		if (args.integrationId) {
			q = ctx.db
				.query("otaProducts")
				.withIndex("by_integration", (q) =>
					q.eq("integrationId", args.integrationId!),
				);
		}
		if (args.tourId) {
			q = ctx.db
				.query("otaProducts")
				.withIndex("by_tour", (q) => q.eq("tourId", args.tourId!));
		}
		const all = await q.collect();
		return all
			.filter((p) =>
				args.syncStatus === undefined || p.syncStatus === args.syncStatus,
			)
			.sort((a, b) => a.otaProductId.localeCompare(b.otaProductId));
	},
});

export const get = query({
	args: { productId: v.id("otaProducts") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const p = await ctx.db.get(args.productId);
		if (!p) throw new ConvexError("Product not found");
		if (p.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: product belongs to a different organization");
		}
		return p;
	},
});

// ---- mutations ----

export const create = mutation({
	args: {
		tourId: v.id("tours"),
		integrationId: v.id("otaIntegrations"),
		otaProductId: v.string(),
		otaProductCode: v.optional(v.string()),
		otaProductUrl: v.optional(v.string()),
		syncStatus: v.optional(v.string()),
		otaTitle: v.optional(v.string()),
		otaDescription: v.optional(v.string()),
		otaPhotos: v.optional(v.array(v.string())),
		otaDurationMinutes: v.optional(v.number()),
		otaPriceOriginalCents: v.optional(v.int64()),
		otaPriceSellingCents: v.optional(v.int64()),
		otaCurrency: v.optional(v.string()),
		basePriceCents: v.optional(v.int64()),
		commissionRate: v.number(),
		commissionAmountCents: v.optional(v.int64()),
		defaultCapacity: v.optional(v.number()),
		minAdvanceBookingHours: v.optional(v.number()),
		maxAdvanceBookingDays: v.optional(v.number()),
		settings: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalCreate as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, ...args },
		);
	},
});

export const internalCreate = internalMutation({
	args: {
		organizationId: v.string(),
		tourId: v.id("tours"),
		integrationId: v.id("otaIntegrations"),
		otaProductId: v.string(),
		otaProductCode: v.optional(v.string()),
		otaProductUrl: v.optional(v.string()),
		syncStatus: v.optional(v.string()),
		otaTitle: v.optional(v.string()),
		otaDescription: v.optional(v.string()),
		otaPhotos: v.optional(v.array(v.string())),
		otaDurationMinutes: v.optional(v.number()),
		otaPriceOriginalCents: v.optional(v.int64()),
		otaPriceSellingCents: v.optional(v.int64()),
		otaCurrency: v.optional(v.string()),
		basePriceCents: v.optional(v.int64()),
		commissionRate: v.number(),
		commissionAmountCents: v.optional(v.int64()),
		defaultCapacity: v.optional(v.number()),
		minAdvanceBookingHours: v.optional(v.number()),
		maxAdvanceBookingDays: v.optional(v.number()),
		settings: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		if (args.commissionRate < 0 || args.commissionRate > 1) {
			throw new ConvexError("commissionRate must be 0..1");
		}
		const [tour, integration] = await Promise.all([
			ctx.db.get(args.tourId),
			ctx.db.get(args.integrationId),
		]);
		if (!tour) throw new ConvexError("Tour not found");
		if (!integration) throw new ConvexError("Integration not found");
		if (tour.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: tour belongs to a different organization");
		}
		if (integration.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: integration belongs to a different organization");
		}
		const now = Date.now();
		return await ctx.db.insert("otaProducts", {
			organizationId: args.organizationId,
			tourId: args.tourId,
			integrationId: args.integrationId,
			otaProductId: args.otaProductId,
			otaProductCode: args.otaProductCode,
			otaProductUrl: args.otaProductUrl,
			syncStatus: args.syncStatus ?? "PENDING",
			otaTitle: args.otaTitle,
			otaDescription: args.otaDescription,
			otaPhotos: args.otaPhotos ?? [],
			otaDurationMinutes: args.otaDurationMinutes,
			otaPriceOriginalCents: args.otaPriceOriginalCents,
			otaPriceSellingCents: args.otaPriceSellingCents,
			otaCurrency: args.otaCurrency ?? "USD",
			basePriceCents: args.basePriceCents,
			commissionRate: args.commissionRate,
			commissionAmountCents: args.commissionAmountCents,
			defaultCapacity: args.defaultCapacity,
			minAdvanceBookingHours: args.minAdvanceBookingHours ?? 24,
			maxAdvanceBookingDays: args.maxAdvanceBookingDays ?? 365,
			settings: args.settings ?? {},
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const update = mutation({
	args: {
		productId: v.id("otaProducts"),
		otaProductCode: v.optional(v.string()),
		otaProductUrl: v.optional(v.string()),
		syncStatus: v.optional(v.string()),
		otaTitle: v.optional(v.string()),
		otaDescription: v.optional(v.string()),
		otaPhotos: v.optional(v.array(v.string())),
		otaDurationMinutes: v.optional(v.number()),
		otaPriceOriginalCents: v.optional(v.int64()),
		otaPriceSellingCents: v.optional(v.int64()),
		otaCurrency: v.optional(v.string()),
		basePriceCents: v.optional(v.int64()),
		commissionRate: v.optional(v.number()),
		commissionAmountCents: v.optional(v.int64()),
		defaultCapacity: v.optional(v.number()),
		minAdvanceBookingHours: v.optional(v.number()),
		maxAdvanceBookingDays: v.optional(v.number()),
		settings: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		const { productId, ...rest } = args;
		return await ctx.runMutation(
			internalUpdate as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, productId, ...rest },
		);
	},
});

export const internalUpdate = internalMutation({
	args: {
		organizationId: v.string(),
		productId: v.id("otaProducts"),
		otaProductCode: v.optional(v.string()),
		otaProductUrl: v.optional(v.string()),
		syncStatus: v.optional(v.string()),
		otaTitle: v.optional(v.string()),
		otaDescription: v.optional(v.string()),
		otaPhotos: v.optional(v.array(v.string())),
		otaDurationMinutes: v.optional(v.number()),
		otaPriceOriginalCents: v.optional(v.int64()),
		otaPriceSellingCents: v.optional(v.int64()),
		otaCurrency: v.optional(v.string()),
		basePriceCents: v.optional(v.int64()),
		commissionRate: v.optional(v.number()),
		commissionAmountCents: v.optional(v.int64()),
		defaultCapacity: v.optional(v.number()),
		minAdvanceBookingHours: v.optional(v.number()),
		maxAdvanceBookingDays: v.optional(v.number()),
		settings: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.productId);
		if (!existing) throw new ConvexError("Product not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		if (args.commissionRate !== undefined) {
			if (args.commissionRate < 0 || args.commissionRate > 1) {
				throw new ConvexError("commissionRate must be 0..1");
			}
		}
		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		for (const field of [
			"otaProductCode",
			"otaProductUrl",
			"syncStatus",
			"otaTitle",
			"otaDescription",
			"otaPhotos",
			"otaDurationMinutes",
			"otaPriceOriginalCents",
			"otaPriceSellingCents",
			"otaCurrency",
			"basePriceCents",
			"commissionRate",
			"commissionAmountCents",
			"defaultCapacity",
			"minAdvanceBookingHours",
			"maxAdvanceBookingDays",
			"settings",
		]) {
			const value = (args as Record<string, unknown>)[field];
			if (value !== undefined) patch[field] = value;
		}
		await ctx.db.patch(args.productId, patch);
		return args.productId;
	},
});

export const remove = mutation({
	args: { productId: v.id("otaProducts") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, productId: args.productId },
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		productId: v.id("otaProducts"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.productId);
		if (!existing) throw new ConvexError("Product not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.delete(args.productId);
		return args.productId;
	},
});