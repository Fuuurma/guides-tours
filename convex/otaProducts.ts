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
import { internal } from "./_generated/api";
import { internalRefs } from "./lib/internalRefs";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";


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
		if (args.integrationId && args.tourId) {
			// Keep both filters active when a caller scopes by integration and
			// tour together. The compound index avoids scanning unrelated
			// products before applying the organization guard.
			q = ctx.db
				.query("otaProducts")
				.withIndex("by_integration_tour", (q) =>
					q
						.eq("integrationId", args.integrationId!)
						.eq("tourId", args.tourId!),
				)
				.filter((q) => q.eq(q.field("organizationId"), orgId));
		} else if (args.integrationId) {
			// SECURITY: scope to org even when filtering by integrationId.
			q = ctx.db
				.query("otaProducts")
				.withIndex("by_integration", (q) =>
					q.eq("integrationId", args.integrationId!),
				)
				.filter((q) => q.eq(q.field("organizationId"), orgId));
		} else if (args.tourId) {
			// SECURITY: scope to org even when filtering by tourId.
			q = ctx.db
				.query("otaProducts")
				.withIndex("by_tour", (q) => q.eq("tourId", args.tourId!))
				.filter((q) => q.eq(q.field("organizationId"), orgId));
		}
		if (args.syncStatus !== undefined) {
			q = q.filter((q) =>
				q.eq(q.field("syncStatus"), args.syncStatus!),
			);
		}
		// Bound the result so an org with thousands of OTA products
		// doesn't OOM the response. Apply filters before the cap so a
		// sparse status match is not lost behind unrelated rows.
		const MAX_OTA_PRODUCTS = 1000;
		const all = await q.take(MAX_OTA_PRODUCTS);
		return all.sort((a, b) => a.otaProductId.localeCompare(b.otaProductId));
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
			internalRefs.otaProducts.internalCreate,
			{ organizationId: member.organizationId, userId: member.userId, ...args },
		);
	},
});

export const internalCreate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
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
		const id = await ctx.db.insert("otaProducts", {
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
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "otaProduct.created",
			resourceType: "otaProduct",
			resourceId: id,
			oldValues: {},
			newValues: {
				tourId: args.tourId,
				integrationId: args.integrationId,
				otaProductId: args.otaProductId,
			},
		});
		return id;
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
			internalRefs.otaProducts.internalUpdate,
			{ organizationId: member.organizationId, userId: member.userId, productId, ...rest },
		);
	},
});

export const internalUpdate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
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
		const changes: Record<string, { old: unknown; new: unknown }> = {};
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
		] as const) {
			const value = args[field];
			if (value !== undefined && value !== existing[field]) {
				patch[field] = value;
				changes[field] = { old: existing[field], new: value };
			}
		}
		if (Object.keys(changes).length === 0) {
			return args.productId;
		}
		await ctx.db.patch(args.productId, patch);
		// Build oldValues from the changes map so the audit log
		// records what each field was before the update. Previously
		// hardcoded to {} — the old values were lost.
		const oldValues: Record<string, unknown> = {};
		for (const [field, change] of Object.entries(changes)) {
			oldValues[field] = change.old;
		}
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "otaProduct.updated",
			resourceType: "otaProduct",
			resourceId: args.productId,
			oldValues,
			newValues: { changes },
		});
		return args.productId;
	},
});

export const remove = mutation({
	args: { productId: v.id("otaProducts") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRefs.otaProducts.internalRemove,
			{ organizationId: member.organizationId, userId: member.userId, productId: args.productId },
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		productId: v.id("otaProducts"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.productId);
		if (!existing) throw new ConvexError("Product not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		// SECURITY: refuse to hard-delete if there are availability
		// cache entries referencing this OTA product. Orphans the
		// cache rows. The operator should deactivate the product
		// (syncStatus) instead.
		const relatedCache = await ctx.db
			.query("otaAvailabilityCache")
			.withIndex("by_product_date", (q) =>
				q.eq("otaProductId", args.productId),
			)
			.take(1);
		if (relatedCache.length > 0) {
			throw new ConvexError(
				"Cannot delete OTA product with availability cache entries; set syncStatus to INACTIVE first",
			);
		}
		await ctx.db.delete(args.productId);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "otaProduct.deleted",
			resourceType: "otaProduct",
			resourceId: args.productId,
			oldValues: {
				tourId: existing.tourId,
				integrationId: existing.integrationId,
				otaProductId: existing.otaProductId,
			},
			newValues: {},
		});
		return args.productId;
	},
});
