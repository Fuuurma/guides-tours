// Rate limit for unauthenticated public booking submissions.
//
// Implemented as a DB-backed sliding window (rather than in-memory)
// because Convex actions + queries don't share state across
// instances, and Cloudflare's per-worker memory is short-lived.
//
// Defaults:
//   - Max 5 booking attempts per email per 15 minutes
//   - (Per-IP rate limiting would require CF-Connecting-IP parsing
//     from headers — left as a future enhancement; email cap
//     alone blocks the most common spam pattern, re-booking
//     attempts for the same email.)
//
// Cleanup: convex/crons.ts runs purgeOldPublicBookingAttempts
// daily to drop rows older than the window.

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

/** Sliding-window cap: 5 attempts per 15 minutes per email. */
export const MAX_ATTEMPTS_PER_EMAIL = 5;
export const WINDOW_MS = 15 * 60 * 1000;

type CountCtx = GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>;

/** Collect all attempts for this email within the current window.
 *  Shared by recordAttempt and countAttempts so the window math
 *  stays in one place. */
async function collectRecentAttempts(
	ctx: CountCtx,
	email: string,
	now: number = Date.now(),
) {
	const windowStart = now - WINDOW_MS;
	return await ctx.db
		.query("publicBookingAttempts")
		.withIndex("by_email_created", (q) =>
			q.eq("email", email).gte("createdAt", windowStart),
		)
		.collect();
}

/** Records an attempt. Returns the attempt ID + whether it was
 *  allowed. Callers should update the outcome via updateAttemptOutcome
 *  once they know if the booking succeeded or failed. */
export const recordAttempt = internalMutation({
	args: {
		email: v.string(),
		slug: v.string(),
		organizationId: v.optional(v.string()),
		outcome: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const recent = await collectRecentAttempts(ctx, args.email, now);

		const allowed = recent.length < MAX_ATTEMPTS_PER_EMAIL;

		// Always record — both successes and rejections — so we can
		// audit attempts even when the rate limit is bypassed.
		const attemptId = await ctx.db.insert("publicBookingAttempts", {
			organizationId: args.organizationId,
			email: args.email,
			slug: args.slug,
			outcome: allowed ? args.outcome : "rejected_rate_limit",
			createdAt: now,
		});

		return { allowed, attempts: recent.length + 1, attemptId };
	},
});

/** Returns the current attempt count for an email in the window.
 *  Used by tests + for showing "try again in N minutes" UI. */
export const countAttempts = internalQuery({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		const recent = await collectRecentAttempts(ctx, args.email);
		return {
			count: recent.length,
			limit: MAX_ATTEMPTS_PER_EMAIL,
			windowMs: WINDOW_MS,
		};
	},
});

/** Cron-cleaned: drops attempts older than 2× the window. */
export const purgeOld = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - 2 * WINDOW_MS;
		const old = await ctx.db
			.query("publicBookingAttempts")
			.withIndex("by_created", (q) => q.lt("createdAt", cutoff))
			.take(500);
		for (const row of old) {
			await ctx.db.delete(row._id);
		}
		return { deleted: old.length };
	},
});

/** Update the outcome of the most recent attempt for an email.
 *  Called after a booking succeeds/fails to record the final result
 *  for audit. The most-recent row is matched by email+slug+createdAt
 *  desc. We update by ID (collected via collectRecentAttempts)
 *  to avoid races where two concurrent attempts exist. */
export const updateAttemptOutcome = internalMutation({
	args: {
		attemptId: v.id("publicBookingAttempts"),
		outcome: v.string(),
		organizationId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const patch: { outcome: string; organizationId?: string } = {
			outcome: args.outcome,
		};
		if (args.organizationId !== undefined) {
			patch.organizationId = args.organizationId;
		}
		await ctx.db.patch(args.attemptId, patch);
		return { updated: true };
	},
});
