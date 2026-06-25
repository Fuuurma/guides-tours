// Tour categories: list/get/create/update/remove.
//
// Source: backend/tours/models.py::TourCategory
//         backend/tours/routers/staff/tour_categories.py (if present;
//         if not, inferred from the schema and other CRUD endpoints)

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
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		let q = ctx.db
			.query("tourCategories")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId));
		if (args.isActive !== undefined) {
			q = ctx.db
				.query("tourCategories")
				.withIndex("by_org_active", (q) =>
					q.eq("organizationId", orgId).eq("isActive", args.isActive!),
				);
		}
		return await q.collect();
	},
});

export const get = query({
	args: { categoryId: v.id("tourCategories") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const cat = await ctx.db.get(args.categoryId);
		if (!cat) throw new ConvexError("Category not found");
		if (cat.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: category belongs to a different organization");
		}
		return cat;
	},
});

// ---- mutations ----

export const create = mutation({
	args: {
		name: v.string(),
		slug: v.string(),
		description: v.optional(v.string()),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
		displayOrder: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalCreate as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, ...args },
		);
	},
});

export const internalCreate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		name: v.string(),
		slug: v.string(),
		description: v.optional(v.string()),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
		displayOrder: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		// Slug uniqueness per org
		const existing = await ctx.db
			.query("tourCategories")
			.withIndex("by_org_slug", (q) =>
				q.eq("organizationId", args.organizationId).eq("slug", args.slug),
			)
			.first();
		if (existing) {
			throw new ConvexError(`Category with slug "${args.slug}" already exists`);
		}
		const now = Date.now();
		const id = await ctx.db.insert("tourCategories", {
			organizationId: args.organizationId,
			name: args.name,
			slug: args.slug,
			description: args.description ?? "",
			icon: args.icon ?? "",
			color: args.color ?? "",
			displayOrder: args.displayOrder ?? 0,
			isActive: true,
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("auditLogs", {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tour_category.created",
			resourceType: "tourCategory",
			resourceId: id,
			oldValues: {},
			newValues: { name: args.name, slug: args.slug },
			timestamp: now,
		});
		return id;
	},
});

export const update = mutation({
	args: {
		categoryId: v.id("tourCategories"),
		name: v.optional(v.string()),
		slug: v.optional(v.string()),
		description: v.optional(v.string()),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
		displayOrder: v.optional(v.number()),
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		const { categoryId, ...rest } = args;
		return await ctx.runMutation(
			internalUpdate as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, categoryId, ...rest },
		);
	},
});

export const internalUpdate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		categoryId: v.id("tourCategories"),
		name: v.optional(v.string()),
		slug: v.optional(v.string()),
		description: v.optional(v.string()),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
		displayOrder: v.optional(v.number()),
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.categoryId);
		if (!existing) throw new ConvexError("Category not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		// If slug is changing, ensure uniqueness
		if (args.slug && args.slug !== existing.slug) {
			const dup = await ctx.db
				.query("tourCategories")
				.withIndex("by_org_slug", (q) =>
					q.eq("organizationId", args.organizationId).eq("slug", args.slug!),
				)
				.first();
			if (dup) {
				throw new ConvexError(`Category with slug "${args.slug}" already exists`);
			}
		}
		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		for (const field of [
			"name",
			"slug",
			"description",
			"icon",
			"color",
			"displayOrder",
			"isActive",
		]) {
			const value = (args as Record<string, unknown>)[field];
			if (value !== undefined) patch[field] = value;
		}
		await ctx.db.patch(args.categoryId, patch);
		await ctx.db.insert("auditLogs", {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tour_category.updated",
			resourceType: "tourCategory",
			resourceId: args.categoryId,
			oldValues: { name: existing.name },
			newValues: patch,
			timestamp: Date.now(),
		});
		return args.categoryId;
	},
});

export const remove = mutation({
	args: { categoryId: v.id("tourCategories") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, categoryId: args.categoryId },
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		categoryId: v.id("tourCategories"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.categoryId);
		if (!existing) throw new ConvexError("Category not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.delete(args.categoryId);
		await ctx.db.insert("auditLogs", {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tour_category.deleted",
			resourceType: "tourCategory",
			resourceId: args.categoryId,
			oldValues: { name: existing.name, slug: existing.slug },
			newValues: {},
			timestamp: Date.now(),
		});
		return args.categoryId;
	},
});
