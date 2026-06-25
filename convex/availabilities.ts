// Availabilities: per-guide, per-date availability flags.
//
// Source: backend/tours/models.py::Availability
//         Used by the assignment conflict guard in
//         assignment_service.py:278-282 to reject scheduling when the
//         guide is marked unavailable.

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
		userId: v.optional(v.string()),
		date: v.optional(v.string()),
		dateFrom: v.optional(v.string()),
		dateTo: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		let q = ctx.db
			.query("availabilities")
			.withIndex("by_org_user_date", (q) =>
				q.eq("organizationId", orgId),
			);
		if (args.userId) {
			q = ctx.db
				.query("availabilities")
				.withIndex("by_user_date", (q) =>
					q.eq("userId", args.userId!),
				);
		}
		const all = await q.collect();
		return all
			.filter((a) => {
				if (args.date && a.date !== args.date) return false;
				if (args.dateFrom && a.date < args.dateFrom) return false;
				if (args.dateTo && a.date > args.dateTo) return false;
				return true;
			})
			.sort((a, b) => a.date.localeCompare(b.date));
	},
});

export const get = query({
	args: { availabilityId: v.id("availabilities") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const a = await ctx.db.get(args.availabilityId);
		if (!a) throw new ConvexError("Availability not found");
		if (a.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: availability belongs to a different organization");
		}
		return a;
	},
});

// ---- mutations ----

export const upsert = mutation({
	args: {
		userIdTarget: v.string(), // the guide whose availability this is
		date: v.string(),
		isAvailable: v.boolean(),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member", "guide"]);
		return await ctx.runMutation(
			internalUpsert as unknown as FunctionReference<"mutation", "public" | "internal">,
			{
				organizationId: member.organizationId,
				callerUserId: member.userId,
				...args,
			},
		);
	},
});

export const internalUpsert = internalMutation({
	args: {
		organizationId: v.string(),
		callerUserId: v.string(),
		userIdTarget: v.string(),
		date: v.string(),
		isAvailable: v.boolean(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("availabilities")
			.withIndex("by_user_date", (q) =>
				q.eq("userId", args.userIdTarget).eq("date", args.date),
			)
			.first();
		if (existing) {
			if (existing.organizationId !== args.organizationId) {
				throw new ConvexError("Forbidden: wrong organization");
			}
			await ctx.db.patch(existing._id, { isAvailable: args.isAvailable });
			return existing._id;
		}
		return await ctx.db.insert("availabilities", {
			organizationId: args.organizationId,
			userId: args.userIdTarget,
			date: args.date,
			isAvailable: args.isAvailable,
			createdAt: Date.now(),
		});
	},
});

export const remove = mutation({
	args: { availabilityId: v.id("availabilities") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member", "guide"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				availabilityId: args.availabilityId,
			},
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		availabilityId: v.id("availabilities"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.availabilityId);
		if (!existing) throw new ConvexError("Availability not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.delete(args.availabilityId);
		return args.availabilityId;
	},
});
