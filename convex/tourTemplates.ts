// Tour templates: list/get/create/update/remove + instantiate.
// Templates are reusable tour blueprints — creating a tour from a
// template pre-fills most fields. Source: backend/tours/models.py::TourTemplate.

import { v, ConvexError } from "convex/values";
import {
	query,
	mutation,
	internalMutation,
} from "./_generated/server";

import type { Id } from "./_generated/dataModel";

import { internalRefs } from "./lib/internalRefs";
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
		// Bound the result so an org with thousands of templates
		// doesn't OOM the response. The FE page renders at most a
		// few dozen active templates.
		const MAX_TEMPLATES = 500;
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
		return await q.take(MAX_TEMPLATES);
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
		requiredGuides: v.optional(v.number()),
		requiresVehicle: v.optional(v.boolean()),
		requiresDriver: v.optional(v.boolean()),
		requiredVehicleType: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRefs.tourTemplates.internalCreate,
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
		requiredGuides: v.optional(v.number()),
		requiresVehicle: v.optional(v.boolean()),
		requiresDriver: v.optional(v.boolean()),
		requiredVehicleType: v.optional(v.string()),
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
		// F406: same numeric/relational invariants tours.internalCreate enforces —
		// templates are cloned into live tours, so a bad template is a bad tour.
		if (!(args.durationHours > 0)) {
			throw new ConvexError("durationHours must be positive");
		}
		const minGuests = args.minGuests ?? 1;
		const maxGuests = args.maxGuests ?? args.capacity;
		if (minGuests < 1) throw new ConvexError("minGuests must be at least 1");
		if (maxGuests < minGuests) {
			throw new ConvexError("maxGuests must be >= minGuests");
		}
		if (maxGuests > args.capacity) {
			throw new ConvexError("maxGuests cannot exceed capacity");
		}
		const requiredGuides = Math.max(1, Math.floor(args.requiredGuides ?? 1));
		if (requiredGuides > 10) {
			throw new ConvexError("requiredGuides cannot exceed 10");
		}
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
			minGuests,
			maxGuests,
			bookingCutoffHours: args.bookingCutoffHours ?? 24,
			requiredGuides,
			requiresVehicle: args.requiresVehicle,
			requiresDriver: args.requiresDriver,
			requiredVehicleType: args.requiredVehicleType,
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
		requiredGuides: v.optional(v.number()),
		requiresVehicle: v.optional(v.boolean()),
		requiresDriver: v.optional(v.boolean()),
		requiredVehicleType: v.optional(v.string()),
		// isActive: operator can archive a template (hidden from
		// new-tour flow) without deleting it.
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		const { templateId, ...rest } = args;
		return await ctx.runMutation(
			internalRefs.tourTemplates.internalUpdate,
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
		requiredGuides: v.optional(v.number()),
		requiresVehicle: v.optional(v.boolean()),
		requiresDriver: v.optional(v.boolean()),
		requiredVehicleType: v.optional(v.string()),
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
		if (args.requiredGuides !== undefined) {
			const n = Math.floor(args.requiredGuides);
			if (n < 1 || n > 10) {
				throw new ConvexError("requiredGuides must be between 1 and 10");
			}
		}
		// Numeric field validation (mirrors internalCreate).
		if (args.capacity !== undefined && args.capacity <= 0) {
			throw new ConvexError("Capacity must be positive");
		}
		if (args.durationHours !== undefined && args.durationHours <= 0) {
			throw new ConvexError("Duration must be positive");
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
			"requiredGuides",
			"requiresVehicle",
			"requiresDriver",
			"requiredVehicleType",
			"isActive",
		]) {
			const value = (args as Record<string, unknown>)[field];
			if (value !== undefined) patch[field] = value;
		}
		if (typeof patch.requiredGuides === "number") {
			patch.requiredGuides = Math.floor(patch.requiredGuides);
		}
		await ctx.db.patch(args.templateId, patch);
		const oldValues: Record<string, unknown> = {};
		for (const key of Object.keys(patch)) {
			if (key === "updatedAt") continue;
			oldValues[key] = (existing as Record<string, unknown>)[key];
		}
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tour_template.updated",
			resourceType: "tourTemplate",
			resourceId: args.templateId,
			oldValues,
			newValues: patch,
		});
		return args.templateId;
	},
});

/**
 * Clone a template into a live tour. FE caller: templates/$templateId
 * "Use template". Same privilege as tours.create (owner/admin) — a
 * member must not mint public tours via this path (F405).
 */
export const instantiate = mutation({
	args: { templateId: v.id("tourTemplates") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		const tmpl = await ctx.db.get(args.templateId);
		if (!tmpl) throw new ConvexError("Template not found");
		if (tmpl.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: template belongs to a different organization");
		}
		// SECURITY: re-validate categoryId belongs to this org
		// (defense in depth — the template was validated at creation
		// but the category could have been deleted or moved since).
		if (tmpl.categoryId !== undefined) {
			const cat = await ctx.db.get(tmpl.categoryId);
			if (cat && cat.organizationId !== member.organizationId) {
				throw new ConvexError(
					"Template's category belongs to a different organization",
				);
			}
		}
		// F406: templates created before the invariant gate can hold bad
		// numbers; refuse to clone them into a live public tour.
		if (!(tmpl.durationHours > 0)) {
			throw new ConvexError("Template durationHours must be positive");
		}
		if (tmpl.minGuests < 1 || tmpl.maxGuests < tmpl.minGuests) {
			throw new ConvexError("Template guest range is invalid");
		}
		if (tmpl.maxGuests > tmpl.capacity) {
			throw new ConvexError("Template maxGuests cannot exceed capacity");
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
			requiredGuides: tmpl.requiredGuides,
			requiresVehicle: tmpl.requiresVehicle,
			requiresDriver: tmpl.requiresDriver,
			requiredVehicleType: tmpl.requiredVehicleType,
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
			internalRefs.tourTemplates.internalRemove,
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
