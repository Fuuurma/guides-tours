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
	internalQuery,
} from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { FunctionReference } from "convex/server";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";
import { MAX_NOTES_LEN } from "./lib/validation";

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
			// SECURITY: scope to org even when filtering by userId —
			// a userId from another org must not be readable here.
			q = ctx.db
				.query("vacationRequests")
				.withIndex("by_user", (q) => q.eq("userId", args.userId!))
				.filter((q) => q.eq(q.field("organizationId"), orgId))
				.order("desc");
		}

		return await q.collect();
	},
});

export const get = query({
	args: { requestId: v.id("vacationRequests") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const vr = await ctx.db.get(args.requestId);
		if (!vr) return null;
		if (vr.organizationId !== member.organizationId) {
			// SECURITY: do not reveal existence of cross-org rows.
			// Return null (same as not-found) rather than throw.
			return null;
		}
		return vr;
	},
});

/**
 * Internal mirror of `get` that skips the authz check. Use only from
 * server-side code that has already verified the caller (e.g. an
 * internal mutation that just inserted the row).
 */
export const getInternal = internalMutation({
	args: { requestId: v.id("vacationRequests") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.requestId);
	},
});

// Helper — pure aggregation used by both the public query and the
// internal mirror for tests. Caller is responsible for org-scoping.
async function _calcStats(
	ctx: QueryCtx,
	targetUserId: string,
	orgId: string,
	year: number,
) {
	const approved = await ctx.db
		.query("vacationRequests")
		.withIndex("by_user_status", (q) =>
			q.eq("userId", targetUserId).eq("status", "approved"),
		)
		.collect();
	const approvedInOrg = approved.filter(
		(vr) => vr.organizationId === orgId,
	);

	let usedDays = 0;
	for (const vr of approvedInOrg) {
		usedDays += calculateVacationDays(vr.startDate, vr.endDate, year);
	}

	const pending = await ctx.db
		.query("vacationRequests")
		.withIndex("by_user_status", (q) =>
			q.eq("userId", targetUserId).eq("status", "pending"),
		)
		.collect();
	const pendingInOrg = pending.filter(
		(vr) => vr.organizationId === orgId,
	);

	const totalDays = 20; // matches source User.vacation_days default
	return {
		year,
		totalDays,
		usedDays,
		remainingDays: totalDays - usedDays,
		pendingCount: pendingInOrg.length,
	};
}

export const getStats = query({
	args: {
		// userId defaults to the caller's own user id. Admins/owners
		// may pass another user's id to look up their stats.
		userId: v.optional(v.string()),
		year: v.number(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		// SECURITY: derive org from session, never accept it as arg
		// (prevents IDOR — same fix pattern as analytics.ts).
		const orgId = member.organizationId;
		// If the caller is looking up someone else's stats, they must
		// be an admin/owner in this org. Guides can only see their own.
		const targetUserId = args.userId ?? member.userId;
		if (targetUserId !== member.userId) {
			if (!["owner", "admin"].includes(member.role as string)) {
				throw new ConvexError(
					"Forbidden: only admins/owners can view another user's stats",
				);
			}
		}
		return await _calcStats(ctx, targetUserId, orgId, args.year);
	},
});

/**
 * Internal mirror of getStats. Takes organizationId directly so
 * tests + cron jobs can call it without going through Better Auth.
 */
export const internalGetStats = internalQuery({
	args: {
		userId: v.string(),
		organizationId: v.string(),
		year: v.number(),
	},
	handler: async (ctx, args) => {
		return await _calcStats(ctx, args.userId, args.organizationId, args.year);
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
			throw new ConvexError("endDate must be on or after startDate");
		}

		// Overlap check: no existing pending/approved request may overlap (source: 123-130).
		// Defense-in-depth: scope by org. A user belonging to multiple orgs
		// shouldn't have their vacation in another org block a request here.
		const existing = await ctx.db
			.query("vacationRequests")
			.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
			.filter((q) => q.eq(q.field("userId"), args.userId))
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

		// Length validation on the optional reason field. Same cap as
		// booking/customer notes — defends against arbitrarily large
		// payloads from any Convex client.
		if (args.reason !== undefined && args.reason.length > MAX_NOTES_LEN) {
			throw new ConvexError(
				`Reason is too long (max ${MAX_NOTES_LEN} characters)`,
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

		await logAudit(ctx, {
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

		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "vacation_request.approved",
			resourceType: "vacationRequest",
			resourceId: args.requestId,
			oldValues: { status: vr.status },
			newValues: { status: "approved" },
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
		// Cap the reject reason at MAX_NOTES_LEN — same limit as the
		// create-side validation.
		if (args.reason !== undefined && args.reason.length > MAX_NOTES_LEN) {
			throw new ConvexError(
				`Reason is too long (max ${MAX_NOTES_LEN} characters)`,
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

		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "vacation_request.rejected",
			resourceType: "vacationRequest",
			resourceId: args.requestId,
			oldValues: { status: vr.status },
			newValues: { status: "rejected" },
		});

		return args.requestId;
	},
});
