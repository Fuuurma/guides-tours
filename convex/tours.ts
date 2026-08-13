// Tours CRUD — first concrete queries/mutations to validate the
// multi-tenancy + authz wiring end-to-end.
//
// Source: reservations-automation backend/tours/routers/staff/tours.py
// (all 33 endpoints ported).

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { FunctionReference } from "convex/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireMembership, requireRole } from "./lib/authz";
import {
	MAX_DESCRIPTION_LEN,
	MAX_NAME_LEN,
	assertFieldWithinLimit,
} from "./lib/validation";
import { logAudit } from "./lib/audit";
import { normalizeTourType, resolveTourStaffing } from "./lib/staffing";

type InternalMutationRef = FunctionReference<"mutation", "internal">;
const createRef = internal.tours.internalCreate as unknown as InternalMutationRef;
const updateRef = internal.tours.internalUpdate as unknown as InternalMutationRef;
const removeRef = internal.tours.internalRemove as unknown as InternalMutationRef;

// ----- Queries -----

/** List tours for the caller's active organization. */
export const list = query({
	args: {
		onlyActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		// by_org_active leads with (org, isActive) — push the active
		// filter into the index when onlyActive is set. Bound the result
		// so an org with thousands of tours doesn't OOM the response.
		const MAX_TOURS = 500;
		if (args.onlyActive === true) {
			const all = await ctx.db
				.query("tours")
				.withIndex("by_org_active", (q) =>
					q
						.eq("organizationId", member.organizationId)
						.eq("isActive", true),
				)
				.take(MAX_TOURS);
			return all.filter((t) => t.deletedAt === undefined);
		}
		const all = await ctx.db
			.query("tours")
			.withIndex("by_org", (q) =>
				q.eq("organizationId", member.organizationId),
			)
			.take(MAX_TOURS);
		return all.filter((t) => t.deletedAt === undefined);
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
		requiresVehicle: v.optional(v.boolean()),
		requiresDriver: v.optional(v.boolean()),
		requiredVehicleType: v.optional(v.string()),
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
			createRef,
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
		requiresVehicle: v.optional(v.boolean()),
		requiresDriver: v.optional(v.boolean()),
		requiredVehicleType: v.optional(v.string()),
		inclusions: v.optional(v.array(v.string())),
		exclusions: v.optional(v.array(v.string())),
		highlights: v.optional(v.array(v.string())),
		basePriceCents: v.optional(v.int64()),
		currency: v.optional(v.string()),
		categoryId: v.optional(v.id("tourCategories")),
		templateId: v.optional(v.id("tourTemplates")),
	},
	handler: async (ctx, args) => {
		// Length validation on free-text fields. Same caps as FE maxLength
		// (validateName/validateDescriptionOptional). The BE is reachable
		// by any Convex client — defending in depth prevents overlong
		// inserts even if the FE is bypassed.
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
		// Cap each language/inclusion/exclusion/highlight entry. The FE
		// caps inclusions/exclusions/highlights at 5000 chars; languages
		// are short codes. Defense in depth.
		if (args.languages !== undefined) {
			for (const lang of args.languages) {
				assertFieldWithinLimit("language", lang, 10);
			}
		}
		for (const [field, max] of [
			["inclusions", 5000],
			["exclusions", 5000],
			["highlights", 5000],
		] as const) {
			const arr = args[field as keyof typeof args] as
				| string[]
				| undefined;
			if (arr !== undefined) {
				for (const item of arr) {
					assertFieldWithinLimit(field, item, max);
				}
			}
		}

		// Numeric field validation (defense in depth — the FE
		// validates these too, but the BE is reachable by any client).
		if (args.capacity <= 0) {
			throw new ConvexError("Capacity must be positive");
		}
		if (args.durationHours <= 0) {
			throw new ConvexError("Duration must be positive");
		}
		const minGuests = args.minGuests ?? 1;
		const maxGuests = args.maxGuests ?? args.capacity;
		if (minGuests < 1) {
			throw new ConvexError("minGuests must be at least 1");
		}
		if (maxGuests < minGuests) {
			throw new ConvexError("maxGuests cannot be less than minGuests");
		}
		if (maxGuests > args.capacity) {
			throw new ConvexError("maxGuests cannot exceed capacity");
		}

		// SECURITY: validate categoryId belongs to this org (defense
		// in depth — a malicious client could submit a foreign ID).
		// Mirrors the check in internalUpdate.
		if (args.categoryId !== undefined) {
			const cat = await ctx.db.get(args.categoryId);
			if (!cat) throw new ConvexError("Category not found");
			if ((cat as { organizationId: string }).organizationId !== args.organizationId) {
				throw new ConvexError("Forbidden: category belongs to a different organization");
			}
		}
		// SECURITY: validate templateId belongs to this org (same
		// defense-in-depth rationale as categoryId).
		if (args.templateId !== undefined) {
			const tpl = await ctx.db.get(args.templateId);
			if (!tpl) throw new ConvexError("Template not found");
			if ((tpl as { organizationId: string }).organizationId !== args.organizationId) {
				throw new ConvexError("Forbidden: template belongs to a different organization");
			}
		}

		const now = Date.now();
		const tourType = normalizeTourType(args.tourType ?? "walking");
		const requiredGuides = Math.max(1, Math.floor(args.requiredGuides ?? 1));
		if (requiredGuides > 10) {
			throw new ConvexError("requiredGuides cannot exceed 10");
		}
		const staffing = resolveTourStaffing({
			tourType,
			requiredGuides,
			requiresVehicle: args.requiresVehicle,
			requiresDriver: args.requiresDriver,
			requiredVehicleType: args.requiredVehicleType,
		});
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
			tourType,
			languages: args.languages ?? [],
			requiredGuides: staffing.requiredGuides,
			requiresVehicle: args.requiresVehicle,
			requiresDriver: args.requiresDriver,
			requiredVehicleType: args.requiredVehicleType?.trim() || undefined,
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
		requiredGuides: v.optional(v.number()),
		requiresVehicle: v.optional(v.boolean()),
		requiresDriver: v.optional(v.boolean()),
		requiredVehicleType: v.optional(v.string()),
		categoryId: v.optional(v.id("tourCategories")),
		templateId: v.optional(v.id("tourTemplates")),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			updateRef,
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
		requiredGuides: v.optional(v.number()),
		requiresVehicle: v.optional(v.boolean()),
		requiresDriver: v.optional(v.boolean()),
		requiredVehicleType: v.optional(v.string()),
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
				throw new ConvexError("Forbidden: category belongs to a different organization");
			}
		}
		// SECURITY: validate templateId belongs to this org (same
		// defense-in-depth rationale as categoryId).
		if (args.templateId !== undefined) {
			const tpl = await ctx.db.get(args.templateId);
			if (!tpl) throw new ConvexError("Template not found");
			if ((tpl as { organizationId: string }).organizationId !== args.organizationId) {
				throw new ConvexError("Forbidden: template belongs to a different organization");
			}
		}

		// Length validation on free-text fields (same caps as create).
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
		if (args.languages !== undefined) {
			for (const lang of args.languages) {
				assertFieldWithinLimit("language", lang, 10);
			}
		}
		if (args.requiredGuides !== undefined) {
			const n = Math.floor(args.requiredGuides);
			if (n < 1 || n > 10) {
				throw new ConvexError("requiredGuides must be between 1 and 10");
			}
		}
		// Numeric field validation (defense in depth — mirrors create).
		if (args.capacity !== undefined && args.capacity <= 0) {
			throw new ConvexError("Capacity must be positive");
		}
		if (args.durationHours !== undefined && args.durationHours <= 0) {
			throw new ConvexError("Duration must be positive");
		}
		if (args.minGuests !== undefined && args.minGuests < 1) {
			throw new ConvexError("minGuests must be at least 1");
		}
		// Cross-field: minGuests <= maxGuests <= capacity. Use the
		// merged values (existing or new) so partial updates validate
		// correctly.
		const mergedMin = args.minGuests ?? tour.minGuests;
		const mergedMax = args.maxGuests ?? tour.maxGuests;
		const mergedCap = args.capacity ?? tour.capacity;
		if (mergedMax < mergedMin) {
			throw new ConvexError("maxGuests cannot be less than minGuests");
		}
		if (mergedMax > mergedCap) {
			throw new ConvexError("maxGuests cannot exceed capacity");
		}

		const now = Date.now();
		const { tourId, organizationId, userId, ...rest } = args;
		const patch: Record<string, unknown> = { updatedAt: now };
		for (const [key, value] of Object.entries(rest)) {
			if (value !== undefined) patch[key] = value;
		}
		if (typeof patch.tourType === "string") {
			patch.tourType = normalizeTourType(patch.tourType);
		}
		if (typeof patch.requiredGuides === "number") {
			patch.requiredGuides = Math.floor(patch.requiredGuides);
		}
		if (typeof patch.requiredVehicleType === "string") {
			const trimmed = patch.requiredVehicleType.trim();
			patch.requiredVehicleType = trimmed || undefined;
		}
		await ctx.db.patch(args.tourId, patch);
		// Log only the changed fields' old values, not the entire tour
		// row. Previously logged the full tour doc (including long
		// description, inclusions, highlights) on every update —
		// bloated the audit log.
		const oldValues: Record<string, unknown> = {};
		for (const key of Object.keys(patch)) {
			if (key === "updatedAt") continue;
			oldValues[key] = (tour as Record<string, unknown>)[key];
		}
		await logAudit(ctx, {
			organizationId: tour.organizationId,
			userId: args.userId,
			action: "tour.updated",
			resourceType: "tour",
			resourceId: args.tourId,
			oldValues,
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
			removeRef,
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
		// Bound the result so an org with thousands of tours doesn't
		// OOM the response. The public booking page renders at most
		// a few dozen active tours.
		const MAX_TOURS = 500;
		const all = await ctx.db
			.query("tours")
			.withIndex("by_org", (q) =>
				q.eq("organizationId", args.organizationId),
			)
			.take(MAX_TOURS);
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
