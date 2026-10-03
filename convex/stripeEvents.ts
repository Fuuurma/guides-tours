// Stripe event dedupe — the idempotency gate for
// /api/payments/stripe/webhook (see payments_stripe_actions.ts).
//
// Distinct from webhookDeliveries: that table is the audit log
// (payload, IP, admin UI); this one is a lean claim table whose
// only job is answering "has this org already processed evt_X?"
// atomically.
//
// Claim semantics:
//   - no row            → insert { status: "processing" } → "claimed"
//   - status processed  → "duplicate" (hard skip)
//   - status processing and fresh (< PROCESSING_STALE_MS)
//                       → "duplicate" (another delivery is in-flight)
//   - status failed, or processing-but-stale (previous delivery
//     crashed between claim and settle)
//                       → reclaim the row → "claimed"
//
// The claim check + insert run inside ONE mutation — a single
// Convex transaction — so concurrent Stripe retries can't both
// pass the gate. If dispatch later throws, `settle` marks the row
// "failed" and the next Stripe retry reclaims it rather than
// being dropped (the pre-stripeEvents path lost those events).
//
// Per-org scoping matters: the endpoint is shared and Stripe
// event ids are only unique per account — org A's copy of evt_1
// must not suppress org B's (same rule as webhookDeliveries F14).

import { v, ConvexError } from "convex/values";
import { internalMutation } from "./_generated/server";

// A row stuck in "processing" longer than this is assumed to come
// from a crashed delivery and is reclaimed. Stripe's retry backoff
// (up to ~3 days) guarantees later attempts still get through.
const PROCESSING_STALE_MS = 10 * 60 * 1000;

/**
 * Atomically check-and-insert the dedupe row for an incoming
 * Stripe event. Returns "claimed" when the caller should process
 * the event, "duplicate" when it must ack-and-skip.
 */
export const claim = internalMutation({
	args: {
		organizationId: v.string(),
		eventId: v.string(),
		eventType: v.string(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("stripeEvents")
			.withIndex("by_org_event", (q) =>
				q
					.eq("organizationId", args.organizationId)
					.eq("eventId", args.eventId),
			)
			.first();
		const now = Date.now();
		if (existing) {
			const inFlight =
				existing.status === "processing" &&
				now - existing.receivedAt < PROCESSING_STALE_MS;
			if (existing.status === "processed" || inFlight) {
				return "duplicate" as const;
			}
			await ctx.db.patch(existing._id, {
				status: "processing",
				eventType: args.eventType,
				errorMessage: undefined,
				attemptCount: existing.attemptCount + 1,
				receivedAt: now,
				processedAt: undefined,
			});
			return "claimed" as const;
		}
		await ctx.db.insert("stripeEvents", {
			organizationId: args.organizationId,
			eventId: args.eventId,
			eventType: args.eventType,
			status: "processing",
			attemptCount: 1,
			receivedAt: now,
		});
		return "claimed" as const;
	},
});

/**
 * Terminal outcome for a claimed event. "processed" closes the
 * event permanently; "failed" leaves it reclaimable so the next
 * Stripe retry re-drives delivery.
 */
export const settle = internalMutation({
	args: {
		organizationId: v.string(),
		eventId: v.string(),
		status: v.union(v.literal("processed"), v.literal("failed")),
		errorMessage: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("stripeEvents")
			.withIndex("by_org_event", (q) =>
				q
					.eq("organizationId", args.organizationId)
					.eq("eventId", args.eventId),
			)
			.first();
		if (!existing) {
			throw new ConvexError(
				`No stripe event row for ${args.eventId} (org ${args.organizationId})`,
			);
		}
		// Never regress a processed row — a late failure signal from
		// an overlapping delivery must not reopen a finished event.
		if (existing.status === "processed") return existing._id;
		await ctx.db.patch(existing._id, {
			status: args.status,
			errorMessage: args.errorMessage,
			processedAt: args.status === "processed" ? Date.now() : undefined,
		});
		return existing._id;
	},
});
