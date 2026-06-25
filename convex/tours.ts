// Tours CRUD — first concrete queries/mutations to validate the
// multi-tenancy + authz wiring end-to-end.
//
// Source: reservations-automation backend/tours/routers/staff/tours.py
// (33 endpoints total — this is a slim subset; the rest land as we
// port each Phase 9 route).

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireMembership, requireRole } from "./lib/authz";

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
		const now = Date.now();
		const tourId = await ctx.db.insert("tours", {
			organizationId: member.organizationId,
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
		await ctx.db.insert("auditLogs", {
			organizationId: member.organizationId,
			userId: member.userId,
			action: "tour.created",
			resourceType: "tour",
			resourceId: tourId,
			oldValues: {},
			newValues: { name: args.name, capacity: args.capacity },
			timestamp: now,
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
	},
	handler: async (ctx, args) => {
		const tour = await ctx.db.get(args.tourId);
		if (!tour) throw new ConvexError("Tour not found");
		const member = await requireRole(ctx, ["owner", "admin"]);
		if (member.organizationId !== tour.organizationId) {
			throw new ConvexError(
				`Forbidden: tour belongs to a different organization`,
			);
		}
		const now = Date.now();
		const { tourId, ...patch } = args;
		await ctx.db.patch(args.tourId, { ...patch, updatedAt: now });
		await ctx.db.insert("auditLogs", {
			organizationId: tour.organizationId,
			userId: member.userId,
			action: "tour.updated",
			resourceType: "tour",
			resourceId: args.tourId,
			oldValues: tour,
			newValues: patch,
			timestamp: now,
		});
		return args.tourId;
	},
});

/** Soft-delete a tour. Requires owner/admin in the tour's org. */
export const remove = mutation({
	args: { tourId: v.id("tours") },
	handler: async (ctx, args) => {
		const tour = await ctx.db.get(args.tourId);
		if (!tour) throw new ConvexError("Tour not found");
		const member = await requireRole(ctx, ["owner", "admin"]);
		if (member.organizationId !== tour.organizationId) {
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
		await ctx.db.insert("auditLogs", {
			organizationId: tour.organizationId,
			userId: member.userId,
			action: "tour.soft_deleted",
			resourceType: "tour",
			resourceId: args.tourId,
			oldValues: { isActive: true },
			newValues: { isActive: false, deletedAt: now },
			timestamp: now,
		});
		return args.tourId;
	},
});
