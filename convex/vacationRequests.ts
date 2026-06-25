// Vacation requests: guides request time off, staff approve/reject.
//
// Source: backend/tours/services/vacation_service.py (180 lines)
//         backend/tours/routers/guide.py (GET/POST /api/guide/vacations)
//         backend/tours/routers/staff/guides.py (GET/PUT /api/staff/vacations/{id})

import { v, ConvexError } from "convex/values";
import {
	query,
	mutation,
	internalMutation,
} from "./_generated/server";
import type { FunctionReference } from "convex/server";
import { requireMembership, requireRole } from "./lib/authz";

// ---- helpers ----

/** Count inclusive vacation days within a calendar year, clamping to year boundaries. */
export function calculateVacationDays(
	startDate: string,
	endDate: string,
	year: number,
): number {
	const yearStart = `${year}-01-01`;
	const yearEnd = `${year}-12-31`;
	const effectiveStart = startDate < yearStart ? yearStart : startDate;
	const effectiveEnd = endDate > yearEnd ? yearEnd : endDate;
	if (effectiveStart > effectiveEnd) return 0;
	const startMs = Date.parse(effectiveStart);
	const endMs = Date.parse(effectiveEnd);
	return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

// ---- queries ----

export const list = query({
	args: {
		status: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("approved"),
				v.literal("rejected"),
			),
		),
		userId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		let q = ctx.db
			.query("vacationRequests")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId))
			.order("desc");

		if (args.status) {
			q = ctx.db
				.query("vacationRequests")
				.withIndex("by_org_status", (q) =>
					q.eq("organizationId", orgId).eq("status", args.status!),
				)
				.order("desc");
		}

		if (args.userId) {
			q = ctx.db
				.query("vacationRequests")
				.withIndex("by_user", (q) => q.eq("userId", args.userId!))
				.order("desc");
		}

		return await q.collect();
	},
});

export const get = query({
	args: { requestId: v.id("vacationRequests") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.requestId);
	},
});

export const getStats = query({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		year: v.number(),
	},
	handler: async (ctx, args) => {
		const approved = await ctx.db
			.query("vacationRequests")
			.withIndex("by_user_status", (q) =>
				q.eq("userId", args.userId).eq("status", "approved"),
			)
			.collect();

		let usedDays = 0;
		for (const vr of approved) {
			usedDays += calculateVacationDays(vr.startDate, vr.endDate, args.year);
		}

		const pending = await ctx.db
			.query("vacationRequests")
			.withIndex("by_user_status", (q) =>
				q.eq("userId", args.userId).eq("status", "pending"),
			)
			.collect();

		const totalDays = 20; // matches source User.vacation_days default
		return {
			year: args.year,
			totalDays,
			usedDays,
			remainingDays: totalDays - usedDays,
			pendingCount: pending.length,
		};
	},
});

// ---- mutations ----

export const create = mutation({
	args: {
		startDate: v.string(),
		endDate: v.string(),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member", "guide"]);
		return await ctx.runMutation(
			internalCreate as unknown as FunctionReference<"mutation", "public" | "internal">,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				startDate: args.startDate,
				endDate: args.endDate,
				reason: args.reason,
			},
		);
	},
});

export const internalCreate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// Date validation (source: vacation_service.py:119-120).
		if (args.endDate < args.startDate) {
			throw new ConvexError("End date must be on or after start date");
		}

		// Overlap check: no existing pending/approved request may overlap (source: 123-130).
		const existing = await ctx.db
			.query("vacationRequests")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.collect();
		const overlap = existing.some(
			(vr) =>
				(vr.status === "pending" || vr.status === "approved") &&
				vr.startDate <= args.endDate &&
				vr.endDate >= args.startDate,
		);
		if (overlap) {
			throw new ConvexError(
				"Vacation request overlaps with an existing pending or approved request",
			);
		}

		const now = Date.now();
		const requestId = await ctx.db.insert("vacationRequests", {
			organizationId: args.organizationId,
			userId: args.userId,
			startDate: args.startDate,
			endDate: args.endDate,
			reason: args.reason ?? "",
			status: "pending",
			createdAt: now,
			updatedAt: now,
		});

		await ctx.db.insert("auditLogs", {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "vacation_request.created",
			resourceType: "vacationRequest",
			resourceId: requestId,
			oldValues: {},
			newValues: {
				startDate: args.startDate,
				endDate: args.endDate,
				reason: args.reason ?? "",
			},
			timestamp: now,
		});

		return requestId;
	},
});

export const approve = mutation({
	args: {
		requestId: v.id("vacationRequests"),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		return await ctx.runMutation(
			internalApprove as unknown as FunctionReference<"mutation", "public" | "internal">,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				requestId: args.requestId,
				reason: args.reason,
			},
		);
	},
});

export const internalApprove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		requestId: v.id("vacationRequests"),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const vr = await ctx.db.get(args.requestId);
		if (!vr) throw new ConvexError("Vacation request not found");
		if (vr.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		if (vr.status !== "pending") {
			throw new ConvexError(
				`Only pending requests can be approved (current: ${vr.status})`,
			);
		}

		const now = Date.now();
		await ctx.db.patch(args.requestId, {
			status: "approved",
			reviewedBy: args.userId,
			reviewedAt: now,
			updatedAt: now,
		});
		if (args.reason) {
			await ctx.db.patch(args.requestId, { reason: args.reason });
		}

		await ctx.db.insert("auditLogs", {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "vacation_request.approved",
			resourceType: "vacationRequest",
			resourceId: args.requestId,
			oldValues: { status: vr.status },
			newValues: { status: "approved" },
			timestamp: now,
		});

		return args.requestId;
	},
});

export const reject = mutation({
	args: {
		requestId: v.id("vacationRequests"),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		return await ctx.runMutation(
			internalReject as unknown as FunctionReference<"mutation", "public" | "internal">,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				requestId: args.requestId,
				reason: args.reason,
			},
		);
	},
});

export const internalReject = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		requestId: v.id("vacationRequests"),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const vr = await ctx.db.get(args.requestId);
		if (!vr) throw new ConvexError("Vacation request not found");
		if (vr.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		if (vr.status !== "pending") {
			throw new ConvexError(
				`Only pending requests can be rejected (current: ${vr.status})`,
			);
		}

		const now = Date.now();
		await ctx.db.patch(args.requestId, {
			status: "rejected",
			reviewedBy: args.userId,
			reviewedAt: now,
			updatedAt: now,
		});
		if (args.reason) {
			await ctx.db.patch(args.requestId, { reason: args.reason });
		}

		await ctx.db.insert("auditLogs", {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "vacation_request.rejected",
			resourceType: "vacationRequest",
			resourceId: args.requestId,
			oldValues: { status: vr.status },
			newValues: { status: "rejected" },
			timestamp: now,
		});

		return args.requestId;
	},
});
