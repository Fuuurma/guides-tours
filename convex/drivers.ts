// Drivers CRUD: list/get/create/update/setActive/remove.
//
// Source: backend/tours/services/driver_service.py (170 lines)
//         backend/tours/routers/staff/fleet.py (drivers endpoints)
//         backend/tours/models.py::Driver

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
import {
	MAX_LICENSE_LEN,
	MAX_NOTES_LEN,
	assertFieldWithinLimit,
} from "./lib/validation";
import { authComponent, createAuth } from "./auth";


const ALLOWED_UPDATE_FIELDS = ["licenseInfo", "notes", "isActive"] as const;
const availabilityValidator = v.object({
	monday: v.optional(v.boolean()),
	tuesday: v.optional(v.boolean()),
	wednesday: v.optional(v.boolean()),
	thursday: v.optional(v.boolean()),
	friday: v.optional(v.boolean()),
	saturday: v.optional(v.boolean()),
	sunday: v.optional(v.boolean()),
});

// ---- queries ----

export const list = query({
	args: {
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		// Bound the result so an org with thousands of drivers
		// doesn't OOM the response. The FE page renders at most a
		// few dozen.
		const MAX_DRIVERS = 500;
		let q = ctx.db
			.query("drivers")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId));
		if (args.isActive !== undefined) {
			q = ctx.db
				.query("drivers")
				.withIndex("by_org_active", (q) =>
					q.eq("organizationId", orgId).eq("isActive", args.isActive!),
				);
		}
		return await q.take(MAX_DRIVERS);
	},
});

export const get = query({
	args: { driverId: v.id("drivers") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const d = await ctx.db.get(args.driverId);
		if (!d) throw new ConvexError("Driver not found");
		if (d.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: driver belongs to a different organization");
		}
		return d;
	},
});

// ---- mutations ----

export const create = mutation({
	args: {
		userId: v.string(),
		licenseInfo: v.string(),
		availability: v.optional(availabilityValidator),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);

		// Mirror assignments.create: the selected user must belong to
		// this organization. Any org member can be a driver profile.
		const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
		const memberList = await auth.api.listMembers({
			headers,
			query: { organizationId: member.organizationId },
		});
		const target = memberList.members.find(
			(m: { userId: string }) => m.userId === args.userId,
		);
		if (!target) {
			throw new ConvexError(
				"Selected user is not a member of this organization",
			);
		}

		return await ctx.runMutation(
			internalRefs.drivers.internalCreate,
			{
				organizationId: member.organizationId,
				createdByUserId: member.userId,
				...args,
			},
		);
	},
});

export const internalCreate = internalMutation({
	args: {
		organizationId: v.string(),
		createdByUserId: v.string(),
		userId: v.string(),
		licenseInfo: v.string(),
		availability: v.optional(availabilityValidator),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		assertFieldWithinLimit("licenseInfo", args.licenseInfo, MAX_LICENSE_LEN);
		if (args.notes) {
			assertFieldWithinLimit("notes", args.notes, MAX_NOTES_LEN);
		}
		// One driver profile per user per org (source: driver_service.py:48-50).
		// The by_user index leads with userId only, so .first() could
		// return a profile from another org — missing a same-org
		// duplicate. Use .filter() to scope by org, then .first().
		const existing = await ctx.db
			.query("drivers")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
			.first();
		if (existing) {
			throw new ConvexError("Driver profile already exists for this user");
		}
		const now = Date.now();
		const driverId = await ctx.db.insert("drivers", {
			organizationId: args.organizationId,
			userId: args.userId,
			licenseInfo: args.licenseInfo,
			availability: args.availability ?? {},
			notes: args.notes ?? "",
			isActive: true,
			createdAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.createdByUserId,
			action: "driver.created",
			resourceType: "driver",
			resourceId: driverId,
			oldValues: {},
			// PII: don't log licenseInfo (may contain driver's license number).
			newValues: { userId: args.userId },
		});
		return driverId;
	},
});

export const update = mutation({
	args: {
		driverId: v.id("drivers"),
		licenseInfo: v.optional(v.string()),
		notes: v.optional(v.string()),
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		const { driverId, ...rest } = args;
		return await ctx.runMutation(
			internalRefs.drivers.internalUpdate,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				driverId,
				...rest,
			},
		);
	},
});

export const internalUpdate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		driverId: v.id("drivers"),
		licenseInfo: v.optional(v.string()),
		notes: v.optional(v.string()),
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		if (args.licenseInfo !== undefined) {
			assertFieldWithinLimit("licenseInfo", args.licenseInfo, MAX_LICENSE_LEN);
		}
		if (args.notes !== undefined) {
			assertFieldWithinLimit("notes", args.notes, MAX_NOTES_LEN);
		}
		const existing = await ctx.db.get(args.driverId);
		if (!existing) throw new ConvexError("Driver not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		for (const field of ALLOWED_UPDATE_FIELDS) {
			const value = (args as Record<string, unknown>)[field];
			if (value !== undefined) {
				patch[field] = value;
			}
		}
		await ctx.db.patch(args.driverId, patch);
		// Build oldValues for every changed field + strip PII (licenseInfo) from log.
		const PII_FIELDS = new Set(["licenseInfo"]);
		const oldValues: Record<string, unknown> = {};
		const newValues: Record<string, unknown> = {};
		for (const key of Object.keys(patch)) {
			if (key === "updatedAt") continue;
			if (PII_FIELDS.has(key)) continue;
			oldValues[key] = (existing as Record<string, unknown>)[key];
			newValues[key] = patch[key];
		}
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "driver.updated",
			resourceType: "driver",
			resourceId: args.driverId,
			oldValues,
			newValues,
		});
		return args.driverId;
	},
});

export const setActive = mutation({
	args: {
		driverId: v.id("drivers"),
		isActive: v.boolean(),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		return await ctx.runMutation(
			internalRefs.drivers.internalSetActive,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				driverId: args.driverId,
				isActive: args.isActive,
			},
		);
	},
});

export const internalSetActive = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		driverId: v.id("drivers"),
		isActive: v.boolean(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.driverId);
		if (!existing) throw new ConvexError("Driver not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.patch(args.driverId, {
			isActive: args.isActive,
			updatedAt: Date.now(),
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "driver.active_changed",
			resourceType: "driver",
			resourceId: args.driverId,
			oldValues: { isActive: existing.isActive },
			newValues: { isActive: args.isActive },
		});
		return args.driverId;
	},
});

export const remove = mutation({
	args: { driverId: v.id("drivers") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRefs.drivers.internalRemove,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				driverId: args.driverId,
			},
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		driverId: v.id("drivers"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.driverId);
		if (!existing) throw new ConvexError("Driver not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.delete(args.driverId);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "driver.deleted",
			resourceType: "driver",
			resourceId: args.driverId,
			oldValues: { userId: existing.userId },
			newValues: {},
		});
		return args.driverId;
	},
});
