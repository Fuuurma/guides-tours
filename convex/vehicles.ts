// Vehicles CRUD: list/get/create/update/setStatus/remove.
//
// Source: backend/tours/services/vehicle_service.py (180 lines)
//         backend/tours/routers/staff/fleet.py (vehicles endpoints)
//         backend/tours/models.py::Vehicle

import { v, ConvexError } from "convex/values";
import {
	query,
	mutation,
	internalMutation,
} from "./_generated/server";
import type { FunctionReference } from "convex/server";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";

const ALLOWED_UPDATE_FIELDS = [
	"name",
	"vehicleType",
	"capacity",
	"licensePlate",
	"make",
	"model",
	"year",
	"color",
	"ownershipType",
	"status",
	"notes",
] as const;

// ---- queries ----

export const list = query({
	args: {
		status: v.optional(v.string()),
		vehicleType: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		let q = ctx.db
			.query("vehicles")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId));
		if (args.status) {
			q = ctx.db
				.query("vehicles")
				.withIndex("by_org_status", (q) =>
					q.eq("organizationId", orgId).eq("status", args.status!),
				);
		}
		if (args.vehicleType) {
			q = ctx.db
				.query("vehicles")
				.withIndex("by_org_type", (q) =>
					q
						.eq("organizationId", orgId)
						.eq("vehicleType", args.vehicleType!),
				);
		}
		const all = await q.collect();
		return all.sort((a, b) => a.name.localeCompare(b.name));
	},
});

export const get = query({
	args: { vehicleId: v.id("vehicles") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const v = await ctx.db.get(args.vehicleId);
		if (!v) throw new ConvexError("Vehicle not found");
		if (v.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: vehicle belongs to a different organization");
		}
		return v;
	},
});

// ---- mutations ----

export const create = mutation({
	args: {
		name: v.string(),
		vehicleType: v.string(),
		capacity: v.number(),
		licensePlate: v.optional(v.string()),
		make: v.optional(v.string()),
		model: v.optional(v.string()),
		year: v.optional(v.number()),
		color: v.optional(v.string()),
		ownershipType: v.optional(v.string()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
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
		vehicleType: v.string(),
		capacity: v.number(),
		licensePlate: v.optional(v.string()),
		make: v.optional(v.string()),
		model: v.optional(v.string()),
		year: v.optional(v.number()),
		color: v.optional(v.string()),
		ownershipType: v.optional(v.string()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (args.capacity <= 0) {
			throw new ConvexError("Capacity must be positive");
		}
		const now = Date.now();
		const vehicleId = await ctx.db.insert("vehicles", {
			organizationId: args.organizationId,
			name: args.name,
			vehicleType: args.vehicleType,
			capacity: args.capacity,
			licensePlate: args.licensePlate ?? "",
			make: args.make ?? "",
			model: args.model ?? "",
			year: args.year,
			color: args.color ?? "",
			ownershipType: args.ownershipType ?? "",
			status: "available",
			notes: args.notes ?? "",
			createdAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "vehicle.created",
			resourceType: "vehicle",
			resourceId: vehicleId,
			oldValues: {},
			newValues: { name: args.name, vehicleType: args.vehicleType },
		});
		return vehicleId;
	},
});

export const update = mutation({
	args: {
		vehicleId: v.id("vehicles"),
		name: v.optional(v.string()),
		vehicleType: v.optional(v.string()),
		capacity: v.optional(v.number()),
		licensePlate: v.optional(v.string()),
		make: v.optional(v.string()),
		model: v.optional(v.string()),
		year: v.optional(v.number()),
		color: v.optional(v.string()),
		ownershipType: v.optional(v.string()),
		status: v.optional(v.string()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		const { vehicleId, ...rest } = args;
		return await ctx.runMutation(
			internalUpdate as unknown as FunctionReference<"mutation", "public" | "internal">,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				vehicleId,
				...rest,
			},
		);
	},
});

export const internalUpdate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		vehicleId: v.id("vehicles"),
		name: v.optional(v.string()),
		vehicleType: v.optional(v.string()),
		capacity: v.optional(v.number()),
		licensePlate: v.optional(v.string()),
		make: v.optional(v.string()),
		model: v.optional(v.string()),
		year: v.optional(v.number()),
		color: v.optional(v.string()),
		ownershipType: v.optional(v.string()),
		status: v.optional(v.string()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.vehicleId);
		if (!existing) throw new ConvexError("Vehicle not found");
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
		await ctx.db.patch(args.vehicleId, patch);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "vehicle.updated",
			resourceType: "vehicle",
			resourceId: args.vehicleId,
			oldValues: { name: existing.name },
			newValues: patch,
		});
		return args.vehicleId;
	},
});

export const setStatus = mutation({
	args: {
		vehicleId: v.id("vehicles"),
		status: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		return await ctx.runMutation(
			internalSetStatus as unknown as FunctionReference<"mutation", "public" | "internal">,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				vehicleId: args.vehicleId,
				status: args.status,
			},
		);
	},
});

export const internalSetStatus = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		vehicleId: v.id("vehicles"),
		status: v.string(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.vehicleId);
		if (!existing) throw new ConvexError("Vehicle not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.patch(args.vehicleId, {
			status: args.status,
			updatedAt: Date.now(),
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "vehicle.status_changed",
			resourceType: "vehicle",
			resourceId: args.vehicleId,
			oldValues: { status: existing.status },
			newValues: { status: args.status },
		});
		return args.vehicleId;
	},
});

export const remove = mutation({
	args: { vehicleId: v.id("vehicles") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				vehicleId: args.vehicleId,
			},
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		vehicleId: v.id("vehicles"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.vehicleId);
		if (!existing) throw new ConvexError("Vehicle not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.delete(args.vehicleId);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "vehicle.deleted",
			resourceType: "vehicle",
			resourceId: args.vehicleId,
			oldValues: { name: existing.name },
			newValues: {},
		});
		return args.vehicleId;
	},
});
