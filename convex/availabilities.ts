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
import { logAudit } from "./lib/audit";

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
		let all;
		if (args.userId) {
			// SECURITY: scope to org even when filtering by userId.
			all = await ctx.db
				.query("availabilities")
				.withIndex("by_user_date", (q) =>
					q.eq("userId", args.userId!),
				)
				.filter((q) => q.eq(q.field("organizationId"), orgId))
				.collect();
		} else {
			// No userId — fetch by org then filter date in JS.
			// (by_org_user_date leads with userId so we can't range-scan
			// by date at the index level without that field.)
			all = await ctx.db
				.query("availabilities")
				.withIndex("by_org_user_date", (q) =>
					q.eq("organizationId", orgId),
				)
				.collect();
		}
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
		// Defense-in-depth: use the org-scoped compound index, not the
		// raw by_user_date index. A guide belonging to multiple orgs
		// shouldn't get their availability in another org matched here.
		const existing = await ctx.db
			.query("availabilities")
			.withIndex("by_org_user_date", (q) =>
				q
					.eq("organizationId", args.organizationId)
					.eq("userId", args.userIdTarget)
					.eq("date", args.date),
			)
			.unique();
		if (existing) {
			const wasAvailable = existing.isAvailable;
			await ctx.db.patch(existing._id, {
				isAvailable: args.isAvailable,
			});
			await logAudit(ctx, {
				organizationId: args.organizationId,
				userId: args.callerUserId,
				action: "availability.updated",
				resourceType: "availability",
				resourceId: existing._id,
				oldValues: { isAvailable: wasAvailable },
				newValues: { isAvailable: args.isAvailable },
			});
			return existing._id;
		}
		const id = await ctx.db.insert("availabilities", {
			organizationId: args.organizationId,
			userId: args.userIdTarget,
			date: args.date,
			isAvailable: args.isAvailable,
			createdAt: Date.now(),
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.callerUserId,
			action: "availability.created",
			resourceType: "availability",
			resourceId: id,
			oldValues: {},
			newValues: {
				userId: args.userIdTarget,
				date: args.date,
				isAvailable: args.isAvailable,
			},
		});
		return id;
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
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "availability.deleted",
			resourceType: "availability",
			resourceId: args.availabilityId,
			oldValues: {
				userId: existing.userId,
				date: existing.date,
				isAvailable: existing.isAvailable,
			},
			newValues: {},
		});
		return args.availabilityId;
	},
});
