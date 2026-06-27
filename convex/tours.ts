// Tours CRUD — first concrete queries/mutations to validate the
// multi-tenancy + authz wiring end-to-end.
//
// Source: reservations-automation backend/tours/routers/staff/tours.py
// (33 endpoints total — this is a slim subset; the rest land as we
// port each Phase 9 route).

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { FunctionReference } from "convex/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";

// ----- Queries -----

/** List tours for the caller's active organization. */
export const list = query({
	args: {
		onlyActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const all = await ctx.db
			.query("tours")
			.withIndex("by_org", (q) =>
				q.eq("organizationId", member.organizationId),
			)
			.collect();
		return args.onlyActive === true
			? all.filter((t) => t.isActive && t.deletedAt === undefined)
			: all.filter((t) => t.deletedAt === undefined);
	},
});

/** Fetch a single tour by id. */
export const get = query({
	args: { tourId: v.id("tours") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const tour = await ctx.db.get(args.tourId);
		if (!tour || tour.deletedAt !== undefined) return null;
		if (tour.organizationId !== member.organizationId) return null;
		return tour;
	},
});

// ----- Mutations -----

/** Create a new tour. Requires owner/admin role. */
export const create = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		defaultTime: v.optional(v.string()),
		durationHours: v.number(),
		capacity: v.number(),
		minGuests: v.optional(v.number()),
		maxGuests: v.optional(v.number()),
		bookingCutoffHours: v.optional(v.number()),
		requiredGuides: v.optional(v.number()),
		bufferMinutes: v.optional(v.number()),
		tourType: v.optional(v.string()),
		languages: v.optional(v.array(v.string())),
		inclusions: v.optional(v.array(v.string())),
		exclusions: v.optional(v.array(v.string())),
		highlights: v.optional(v.array(v.string())),
		basePriceCents: v.optional(v.int64()),
		currency: v.optional(v.string()),
		categoryId: v.optional(v.id("tourCategories")),
		templateId: v.optional(v.id("tourTemplates")),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalCreate as unknown as FunctionReference<"mutation", "public" | "internal">,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				...args,
			},
		);
	},
});

export const internalCreate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		defaultTime: v.optional(v.string()),
		durationHours: v.number(),
		capacity: v.number(),
		minGuests: v.optional(v.number()),
		maxGuests: v.optional(v.number()),
		bookingCutoffHours: v.optional(v.number()),
		requiredGuides: v.optional(v.number()),
		bufferMinutes: v.optional(v.number()),
		tourType: v.optional(v.string()),
		languages: v.optional(v.array(v.string())),
		inclusions: v.optional(v.array(v.string())),
		exclusions: v.optional(v.array(v.string())),
		highlights: v.optional(v.array(v.string())),
		basePriceCents: v.optional(v.int64()),
		currency: v.optional(v.string()),
		categoryId: v.optional(v.id("tourCategories")),
		templateId: v.optional(v.id("tourTemplates")),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const tourId = await ctx.db.insert("tours", {
			organizationId: args.organizationId,
			name: args.name,
			description: args.description ?? "",
			defaultTime: args.defaultTime,
			durationHours: args.durationHours,
			isActive: true,
			recurrenceType: "none",
			recurrenceDaysOfWeek: [],
			recurrenceEndDate: undefined,
			capacity: args.capacity,
			bufferMinutes: args.bufferMinutes ?? 15,
			minGuests: args.minGuests ?? 1,
			maxGuests: args.maxGuests ?? args.capacity,
			bookingCutoffHours: args.bookingCutoffHours ?? 24,
			tourType: args.tourType ?? "walkable",
			languages: args.languages ?? [],
			requiredGuides: args.requiredGuides ?? 1,
			categoryId: args.categoryId,
			templateId: args.templateId,
			inclusions: args.inclusions ?? [],
			exclusions: args.exclusions ?? [],
			highlights: args.highlights ?? [],
			basePriceCents: args.basePriceCents,
			currency: args.currency ?? "USD",
			createdAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tour.created",
			resourceType: "tour",
			resourceId: tourId,
			oldValues: {},
			newValues: { name: args.name, capacity: args.capacity },
		});
		return tourId;
	},
});

/** Update a tour. Requires owner/admin. */
export const update = mutation({
	args: {
		tourId: v.id("tours"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		defaultTime: v.optional(v.string()),
		durationHours: v.optional(v.number()),
		capacity: v.optional(v.number()),
		minGuests: v.optional(v.number()),
		maxGuests: v.optional(v.number()),
		isActive: v.optional(v.boolean()),
		basePriceCents: v.optional(v.int64()),
		tourType: v.optional(v.string()),
		languages: v.optional(v.array(v.string())),
		categoryId: v.optional(v.id("tourCategories")),
		templateId: v.optional(v.id("tourTemplates")),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalUpdate as unknown as FunctionReference<"mutation", "public" | "internal">,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				...args,
			},
		);
	},
});

export const internalUpdate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		tourId: v.id("tours"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		defaultTime: v.optional(v.string()),
		durationHours: v.optional(v.number()),
		capacity: v.optional(v.number()),
		minGuests: v.optional(v.number()),
		maxGuests: v.optional(v.number()),
		isActive: v.optional(v.boolean()),
		basePriceCents: v.optional(v.int64()),
		tourType: v.optional(v.string()),
		languages: v.optional(v.array(v.string())),
		categoryId: v.optional(v.id("tourCategories")),
		templateId: v.optional(v.id("tourTemplates")),
	},
	handler: async (ctx, args) => {
		const tour = await ctx.db.get(args.tourId);
		if (!tour) throw new ConvexError("Tour not found");
		if (tour.organizationId !== args.organizationId) {
			throw new ConvexError(
				`Forbidden: tour belongs to a different organization`,
			);
		}
		// SECURITY: validate categoryId belongs to this org (defense
		// in depth — a malicious client could submit a foreign ID).
		if (args.categoryId !== undefined) {
			const cat = await ctx.db.get(args.categoryId);
			if (!cat) throw new ConvexError("Category not found");
			if ((cat as { organizationId: string }).organizationId !== args.organizationId) {
				throw new ConvexError("Category belongs to a different organization");
			}
		}
		const now = Date.now();
		const { tourId, organizationId, userId, ...patch } = args;
		await ctx.db.patch(args.tourId, { ...patch, updatedAt: now });
		await logAudit(ctx, {
			organizationId: tour.organizationId,
			userId: args.userId,
			action: "tour.updated",
			resourceType: "tour",
			resourceId: args.tourId,
			oldValues: tour,
			newValues: patch,
		});
		return args.tourId;
	},
});

/** Soft-delete a tour. Requires owner/admin in the tour's org. */
export const remove = mutation({
	args: { tourId: v.id("tours") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				tourId: args.tourId,
			},
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		tourId: v.id("tours"),
	},
	handler: async (ctx, args) => {
		const tour = await ctx.db.get(args.tourId);
		if (!tour) throw new ConvexError("Tour not found");
		if (tour.organizationId !== args.organizationId) {
			throw new ConvexError(
				`Forbidden: tour belongs to a different organization`,
			);
		}
		const now = Date.now();
		await ctx.db.patch(args.tourId, {
			isActive: false,
			deletedAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: tour.organizationId,
			userId: args.userId,
			action: "tour.soft_deleted",
			resourceType: "tour",
			resourceId: args.tourId,
			oldValues: { isActive: true },
			newValues: { isActive: false, deletedAt: now },
		});
		return args.tourId;
	},
});

// ----- Internal mirrors (no auth, for tests + internal callers) -----

/**
 * Internal mirror of `list` that takes organizationId directly.
 * Excludes soft-deleted tours. Used by tests + scheduled jobs
 * that already have a verified orgId.
 */
export const listInternal = internalQuery({
	args: {
		organizationId: v.string(),
		onlyActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const all = await ctx.db
			.query("tours")
			.withIndex("by_org", (q) =>
				q.eq("organizationId", args.organizationId),
			)
			.collect();
		const visible = all.filter((t) => t.deletedAt === undefined);
		return args.onlyActive === true
			? visible.filter((t) => t.isActive)
			: visible;
	},
});

/** Internal mirror of `get`. Returns the row regardless of deletedAt
 *  — callers should re-check deletedAt if they need live-only. */
export const getInternal = internalQuery({
	args: { tourId: v.id("tours") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.tourId);
	},
});
