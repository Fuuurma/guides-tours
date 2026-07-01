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
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";
import {
	MAX_LICENSE_LEN,
	MAX_NOTES_LEN,
	assertFieldWithinLimit,
} from "./lib/validation";

const ALLOWED_UPDATE_FIELDS = ["licenseInfo", "notes", "isActive"] as const;

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
		availability: v.optional(v.any()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		return await ctx.runMutation(
			internalCreate as unknown as FunctionReference<"mutation", "public" | "internal">,
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
		availability: v.optional(v.any()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		assertFieldWithinLimit("licenseInfo", args.licenseInfo, MAX_LICENSE_LEN);
		if (args.notes) {
			assertFieldWithinLimit("notes", args.notes, MAX_NOTES_LEN);
		}
		// One driver profile per user per company (source: driver_service.py:48-50).
		const existing = await ctx.db
			.query("drivers")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.first();
		if (existing && existing.organizationId === args.organizationId) {
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
			newValues: { userId: args.userId, licenseInfo: args.licenseInfo },
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
			internalUpdate as unknown as FunctionReference<"mutation", "public" | "internal">,
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
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "driver.updated",
			resourceType: "driver",
			resourceId: args.driverId,
			oldValues: { isActive: existing.isActive },
			newValues: patch,
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
			internalSetActive as unknown as FunctionReference<"mutation", "public" | "internal">,
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
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
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
