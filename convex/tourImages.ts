// Tour images: per-tour gallery with primary image flag.
//
// Source: backend/tours/models.py::TourImage
// Uses Convex file storage (ctx.storage) for the actual blob.
// Clients resolve to a URL via ctx.storage.getUrl(storageId).

import { v, ConvexError } from "convex/values";
import {
	query,
	mutation,
	internalMutation,
} from "./_generated/server";
import type { FunctionReference } from "convex/server";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";

// ---- queries ----

export const list = query({
	args: {
		tourId: v.optional(v.id("tours")),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		let q = ctx.db
			.query("tourImages")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId));
		if (args.tourId) {
			// SECURITY: scope to org even when filtering by tourId.
			q = ctx.db
				.query("tourImages")
				.withIndex("by_tour", (q) => q.eq("tourId", args.tourId!))
				.filter((q) => q.eq(q.field("organizationId"), orgId));
		}
		const rows = await q.collect();
		return rows.sort((a, b) => a.displayOrder - b.displayOrder);
	},
});

export const get = query({
	args: { imageId: v.id("tourImages") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const img = await ctx.db.get(args.imageId);
		if (!img) throw new ConvexError("Image not found");
		if (img.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: image belongs to a different organization");
		}
		const url = await ctx.storage.getUrl(img.storageId);
		return { ...img, url };
	},
});

export const getUrl = query({
	args: { storageId: v.id("_storage") },
	handler: async (ctx, args) => {
		// SECURITY: require membership + verify the storageId is
		// referenced by one of this org's tourImages rows. Without
		// this check, any signed-in user could fetch a signed URL
		// for any blob in Convex storage by guessing/iterating IDs.
		const member = await requireMembership(ctx);
		const img = await ctx.db
			.query("tourImages")
			.withIndex("by_org", (q) =>
				q.eq("organizationId", member.organizationId),
			)
			.filter((q) => q.eq(q.field("storageId"), args.storageId))
			.first();
		if (!img) return null;
		return await ctx.storage.getUrl(args.storageId);
	},
});

// ---- mutations ----

export const internalAdd = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		tourId: v.id("tours"),
		storageId: v.id("_storage"),
		altText: v.optional(v.string()),
		isPrimary: v.optional(v.boolean()),
		displayOrder: v.optional(v.number()),
		width: v.optional(v.number()),
		height: v.optional(v.number()),
		fileSize: v.optional(v.number()),
		format: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const tour = await ctx.db.get(args.tourId);
		if (!tour) throw new ConvexError("Tour not found");
		if (tour.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: tour belongs to a different organization");
		}
		// If isPrimary is set, demote any existing primary for this tour.
		// Use by_tour_primary to fetch only primary images (small set)
		// instead of all tour images.
		if (args.isPrimary) {
			const existingPrimaries = await ctx.db
				.query("tourImages")
				.withIndex("by_tour_primary", (q) =>
					q.eq("tourId", args.tourId).eq("isPrimary", true),
				)
				.collect();
			for (const img of existingPrimaries) {
				await ctx.db.patch(img._id, { isPrimary: false, updatedAt: Date.now() });
			}
		}
		const now = Date.now();
		const id = await ctx.db.insert("tourImages", {
			organizationId: args.organizationId,
			tourId: args.tourId,
			storageId: args.storageId,
			altText: args.altText ?? "",
			isPrimary: args.isPrimary ?? false,
			displayOrder: args.displayOrder ?? 0,
			width: args.width ?? 0,
			height: args.height ?? 0,
			fileSize: args.fileSize ?? 0,
			format: args.format ?? "",
			createdAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourImage.added",
			resourceType: "tourImage",
			resourceId: id,
			oldValues: {},
			newValues: {
				tourId: args.tourId,
				isPrimary: args.isPrimary ?? false,
			},
		});
		return id;
	},
});

export const update = mutation({
	args: {
		imageId: v.id("tourImages"),
		altText: v.optional(v.string()),
		isPrimary: v.optional(v.boolean()),
		displayOrder: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		const { imageId, ...rest } = args;
		return await ctx.runMutation(
			internalUpdate as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, imageId, ...rest },
		);
	},
});

export const internalUpdate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		imageId: v.id("tourImages"),
		altText: v.optional(v.string()),
		isPrimary: v.optional(v.boolean()),
		displayOrder: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.imageId);
		if (!existing) throw new ConvexError("Image not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		// If promoting to primary, demote any existing primary for the
		// same tour. Use by_tour_primary to fetch only primaries (small
		// set) instead of all tour images.
		if (args.isPrimary && !existing.isPrimary) {
			const others = await ctx.db
				.query("tourImages")
				.withIndex("by_tour_primary", (q) =>
					q.eq("tourId", existing.tourId).eq("isPrimary", true),
				)
				.collect();
			for (const img of others) {
				if (img._id !== existing._id) {
					await ctx.db.patch(img._id, { isPrimary: false, updatedAt: Date.now() });
				}
			}
		}
		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		const changes: Record<string, { old: unknown; new: unknown }> = {};
		if (args.altText !== undefined && args.altText !== existing.altText) {
			patch.altText = args.altText;
			changes.altText = { old: existing.altText, new: args.altText };
		}
		if (args.isPrimary !== undefined && args.isPrimary !== existing.isPrimary) {
			patch.isPrimary = args.isPrimary;
			changes.isPrimary = { old: existing.isPrimary, new: args.isPrimary };
		}
		if (
			args.displayOrder !== undefined &&
			args.displayOrder !== existing.displayOrder
		) {
			patch.displayOrder = args.displayOrder;
			changes.displayOrder = {
				old: existing.displayOrder,
				new: args.displayOrder,
			};
		}
		if (Object.keys(changes).length === 0) {
			return args.imageId;
		}
		await ctx.db.patch(args.imageId, patch);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourImage.updated",
			resourceType: "tourImage",
			resourceId: args.imageId,
			oldValues: {},
			newValues: { changes },
		});
		return args.imageId;
	},
});

export const remove = mutation({
	args: { imageId: v.id("tourImages") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, imageId: args.imageId },
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		imageId: v.id("tourImages"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.imageId);
		if (!existing) throw new ConvexError("Image not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.delete(args.imageId);
		// Best-effort: also delete the storage blob
		try {
			await ctx.storage.delete(existing.storageId);
		} catch {
			// ignore — blob may already be gone
		}
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourImage.deleted",
			resourceType: "tourImage",
			resourceId: args.imageId,
			oldValues: {
				tourId: existing.tourId,
				isPrimary: existing.isPrimary,
			},
			newValues: {},
		});
		return args.imageId;
	},
});
