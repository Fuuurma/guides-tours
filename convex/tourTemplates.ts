// Tour templates: list/get/create/update/remove + instantiate.
// Templates are reusable tour blueprints — creating a tour from a
// template pre-fills most fields. Source: backend/tours/models.py::TourTemplate.

import { v, ConvexError } from "convex/values";
import {
	query,
	mutation,
	internalMutation,
} from "./_generated/server";
import type { FunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";
import {
	MAX_DESCRIPTION_LEN,
	MAX_NAME_LEN,
	assertFieldWithinLimit,
} from "./lib/validation";

// ---- queries ----

export const list = query({
	args: {
		categoryId: v.optional(v.id("tourCategories")),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		let q = ctx.db
			.query("tourTemplates")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId));
		if (args.categoryId) {
			q = ctx.db
				.query("tourTemplates")
				.withIndex("by_org_category", (q) =>
					q.eq("organizationId", orgId).eq("categoryId", args.categoryId!),
				);
		}
		return await q.collect();
	},
});

export const get = query({
	args: { templateId: v.id("tourTemplates") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const t = await ctx.db.get(args.templateId);
		if (!t) throw new ConvexError("Template not found");
		if (t.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: template belongs to a different organization");
		}
		return t;
	},
});

// ---- mutations ----

export const create = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		durationHours: v.number(),
		defaultTime: v.optional(v.string()),
		capacity: v.number(),
		tourType: v.string(),
		categoryId: v.optional(v.id("tourCategories")),
		languages: v.array(v.string()),
		inclusions: v.optional(v.array(v.string())),
		exclusions: v.optional(v.array(v.string())),
		highlights: v.optional(v.array(v.string())),
		minGuests: v.optional(v.number()),
		maxGuests: v.optional(v.number()),
		bookingCutoffHours: v.optional(v.number()),
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
		description: v.optional(v.string()),
		durationHours: v.number(),
		defaultTime: v.optional(v.string()),
		capacity: v.number(),
		tourType: v.string(),
		categoryId: v.optional(v.id("tourCategories")),
		languages: v.array(v.string()),
		inclusions: v.optional(v.array(v.string())),
		exclusions: v.optional(v.array(v.string())),
		highlights: v.optional(v.array(v.string())),
		minGuests: v.optional(v.number()),
		maxGuests: v.optional(v.number()),
		bookingCutoffHours: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		if (args.name.length > MAX_NAME_LEN) {
			throw new ConvexError(
				`Name is too long (max ${MAX_NAME_LEN} characters)`,
			);
		}
		if (args.description !== undefined) {
			assertFieldWithinLimit(
				"description",
				args.description,
				MAX_DESCRIPTION_LEN,
			);
		}
		if (args.capacity <= 0) throw new ConvexError("Capacity must be positive");
		const now = Date.now();
		const id = await ctx.db.insert("tourTemplates", {
			organizationId: args.organizationId,
			name: args.name,
			description: args.description ?? "",
			durationHours: args.durationHours,
			defaultTime: args.defaultTime,
			capacity: args.capacity,
			tourType: args.tourType,
			categoryId: args.categoryId,
			languages: args.languages,
			inclusions: args.inclusions ?? [],
			exclusions: args.exclusions ?? [],
			highlights: args.highlights ?? [],
			minGuests: args.minGuests ?? 1,
			maxGuests: args.maxGuests ?? args.capacity,
			bookingCutoffHours: args.bookingCutoffHours ?? 24,
			requiredGuides: 1,
			isActive: true,
			createdAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tour_template.created",
			resourceType: "tourTemplate",
			resourceId: id,
			oldValues: {},
			newValues: { name: args.name, tourType: args.tourType },
		});
		return id;
	},
});

export const update = mutation({
	args: {
		templateId: v.id("tourTemplates"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		durationHours: v.optional(v.number()),
		defaultTime: v.optional(v.string()),
		capacity: v.optional(v.number()),
		tourType: v.optional(v.string()),
		categoryId: v.optional(v.id("tourCategories")),
		languages: v.optional(v.array(v.string())),
		inclusions: v.optional(v.array(v.string())),
		exclusions: v.optional(v.array(v.string())),
		highlights: v.optional(v.array(v.string())),
		minGuests: v.optional(v.number()),
		maxGuests: v.optional(v.number()),
		bookingCutoffHours: v.optional(v.number()),
		// isActive: operator can archive a template (hidden from
		// new-tour flow) without deleting it.
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		const { templateId, ...rest } = args;
		return await ctx.runMutation(
			internalUpdate as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, templateId, ...rest },
		);
	},
});

export const internalUpdate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		templateId: v.id("tourTemplates"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		durationHours: v.optional(v.number()),
		defaultTime: v.optional(v.string()),
		capacity: v.optional(v.number()),
		tourType: v.optional(v.string()),
		categoryId: v.optional(v.id("tourCategories")),
		languages: v.optional(v.array(v.string())),
		inclusions: v.optional(v.array(v.string())),
		exclusions: v.optional(v.array(v.string())),
		highlights: v.optional(v.array(v.string())),
		minGuests: v.optional(v.number()),
		maxGuests: v.optional(v.number()),
		bookingCutoffHours: v.optional(v.number()),
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.templateId);
		if (!existing) throw new ConvexError("Template not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		// Length validation on free-text fields (defense in depth).
		if (args.name !== undefined && args.name.length > MAX_NAME_LEN) {
			throw new ConvexError(
				`Name is too long (max ${MAX_NAME_LEN} characters)`,
			);
		}
		if (args.description !== undefined) {
			assertFieldWithinLimit(
				"description",
				args.description,
				MAX_DESCRIPTION_LEN,
			);
		}
		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		for (const field of [
			"name",
			"description",
			"durationHours",
			"defaultTime",
			"capacity",
			"tourType",
			"categoryId",
			"languages",
			"inclusions",
			"exclusions",
			"highlights",
			"minGuests",
			"maxGuests",
			"bookingCutoffHours",
			"isActive",
		]) {
			const value = (args as Record<string, unknown>)[field];
			if (value !== undefined) patch[field] = value;
		}
		await ctx.db.patch(args.templateId, patch);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tour_template.updated",
			resourceType: "tourTemplate",
			resourceId: args.templateId,
			oldValues: { name: existing.name },
			newValues: patch,
		});
		return args.templateId;
	},
});

/**
 * @internal
 * No FE caller. Useful for "clone template → new tour" workflow that
 * the templates list page doesn't have a button for yet.
 * See docs/DATA_LAYER_STATUS.md.
 */
export const instantiate = mutation({
	args: { templateId: v.id("tourTemplates") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		const tmpl = await ctx.db.get(args.templateId);
		if (!tmpl) throw new ConvexError("Template not found");
		if (tmpl.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: template belongs to a different organization");
		}
		const now = Date.now();
		const tourId: Id<"tours"> = await ctx.db.insert("tours", {
			organizationId: member.organizationId,
			name: tmpl.name,
			description: tmpl.description,
			durationHours: tmpl.durationHours,
			defaultTime: tmpl.defaultTime,
			isActive: true,
			recurrenceType: "none",
			recurrenceDaysOfWeek: [],
			capacity: tmpl.capacity,
			bufferMinutes: 15,
			minGuests: tmpl.minGuests,
			maxGuests: tmpl.maxGuests,
			bookingCutoffHours: tmpl.bookingCutoffHours,
			tourType: tmpl.tourType,
			categoryId: tmpl.categoryId,
			templateId: tmpl._id,
			languages: tmpl.languages,
			requiredGuides: 1,
			inclusions: tmpl.inclusions,
			exclusions: tmpl.exclusions,
			highlights: tmpl.highlights,
			currency: "USD",
			createdAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: member.organizationId,
			userId: member.userId,
			action: "tour.created_from_template",
			resourceType: "tour",
			resourceId: tourId,
			oldValues: {},
			newValues: { templateId: tmpl._id, name: tmpl.name },
		});
		return tourId;
	},
});

export const remove = mutation({
	args: { templateId: v.id("tourTemplates") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, templateId: args.templateId },
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		templateId: v.id("tourTemplates"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.templateId);
		if (!existing) throw new ConvexError("Template not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.delete(args.templateId);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tour_template.deleted",
			resourceType: "tourTemplate",
			resourceId: args.templateId,
			oldValues: { name: existing.name },
			newValues: {},
		});
		return args.templateId;
	},
});
