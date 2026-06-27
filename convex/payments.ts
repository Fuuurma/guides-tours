// Payments CRUD + Stripe integration helpers.
//
// Source: backend/tours/services/payments/stripe.py
//         backend/tours/services/payments/interface.py
//         backend/tours/api_payments.py
//
// Phase 7.3 scope:
//   - internal mutations: record (creates a row in PENDING),
//     markSucceeded, markFailed, markRefunded, refund
//   - settings mutations: getOrCreate for paymentSettings (Stripe
//     keys, deposit %, default currency)
//
// Stripe API calls live in convex/payments_stripe_actions.ts (uses
// 'use node' for fetch + Stripe signature). Webhook handling lives
// in convex/http.ts under /api/payments/stripe/webhook.

import { v, ConvexError } from "convex/values";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";

// ----- Queries -----

export const list = query({
	args: {
		bookingId: v.optional(v.id("bookings")),
		status: v.optional(v.string()),
		page: v.optional(v.number()),
		pageSize: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const pageSize = Math.min(args.pageSize ?? 20, 100);
		const page = Math.max(1, args.page ?? 1);

		const all = await ctx.db
			.query("payments")
			.withIndex("by_org", (q) =>
				q.eq("organizationId", member.organizationId),
			)
			.collect();
		let filtered = all;
		if (args.bookingId) {
			filtered = filtered.filter((p) => p.bookingId === args.bookingId);
		}
		if (args.status) {
			filtered = filtered.filter((p) => p.status === args.status);
		}
		filtered.sort((a, b) => b.createdAt - a.createdAt);
		const total = filtered.length;
		const offset = (page - 1) * pageSize;
		return {
			items: filtered.slice(offset, offset + pageSize),
			total,
			page,
			pageSize,
			hasNext: offset + pageSize < total,
		};
	},
});

export const get = query({
	args: { paymentId: v.id("payments") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const p = await ctx.db.get(args.paymentId);
		if (!p) return null;
		if (p.organizationId !== member.organizationId) return null;
		return p;
	},
});

/** Public settings for the org (no secrets). */
export const getPublicSettings = query({
	args: {},
	handler: async (ctx) => {
		const member = await requireMembership(ctx);
		const s = await ctx.db
			.query("paymentSettings")
			.withIndex("by_org", (q) =>
				q.eq("organizationId", member.organizationId),
			)
			.unique();
		if (!s) return null;
		return {
			stripeEnabled: s.stripeEnabled,
			stripePublishableKey: s.stripePublishableKey,
			stripeIsSandbox: s.stripeIsSandbox,
			acceptDeposits: s.acceptDeposits,
			depositPercentage: s.depositPercentage,
			defaultCurrency: s.defaultCurrency,
		};
	},
});

// ----- Mutations: payments -----

/**
 * Record a new payment (typically PENDING until the Stripe webhook
 * confirms). Idempotent by stripePaymentIntentId — if a row with
 * the same intent already exists, return it.
 */
export const record = mutation({
	args: {
		bookingId: v.optional(v.id("bookings")),
		amountCents: v.int64(),
		currency: v.string(),
		stripePaymentIntentId: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, [
			"owner",
			"admin",
			"member",
		]);
		// Idempotency check.
		const existing = await ctx.db
			.query("payments")
			.withIndex("by_stripe_intent", (q) =>
				q.eq("stripePaymentIntentId", args.stripePaymentIntentId),
			)
			.unique();
		if (existing) return existing._id;

		const now = Date.now();
		const paymentId = await ctx.db.insert("payments", {
			organizationId: member.organizationId,
			bookingId: args.bookingId,
			amountCents: args.amountCents,
			currency: args.currency,
			status: "pending",
			provider: "stripe",
			stripePaymentIntentId: args.stripePaymentIntentId,
			createdAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: member.organizationId,
			userId: member.userId,
			action: "payment.recorded",
			resourceType: "payment",
			resourceId: paymentId,
			oldValues: {},
			newValues: {
				amountCents: args.amountCents.toString(),
				currency: args.currency,
				bookingId: args.bookingId ?? null,
			},
		});
		return paymentId;
	},
});

/**
 * Mark a payment succeeded (called by Stripe webhook + by manual
 * admin action). Idempotent — re-applying doesn't double-update.
 */
export const markSucceeded = internalMutation({
	args: {
		paymentId: v.id("payments"),
	},
	handler: async (ctx, args) => {
		const p = await ctx.db.get(args.paymentId);
		if (!p) throw new ConvexError("Payment not found");
		if (p.status === "succeeded") return args.paymentId;
		const now = Date.now();
		await ctx.db.patch(args.paymentId, {
			status: "succeeded",
			processedAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: p.organizationId,
			userId: "stripe_webhook",
			action: "payment.succeeded",
			resourceType: "payment",
			resourceId: args.paymentId,
			oldValues: { status: p.status },
			newValues: { status: "succeeded", processedAt: now },
		});
		return args.paymentId;
	},
});

export const markFailed = internalMutation({
	args: {
		paymentId: v.id("payments"),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const p = await ctx.db.get(args.paymentId);
		if (!p) throw new ConvexError("Payment not found");
		if (p.status === "failed") return args.paymentId;
		const now = Date.now();
		await ctx.db.patch(args.paymentId, {
			status: "failed",
			processedAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: p.organizationId,
			userId: "stripe_webhook",
			action: "payment.failed",
			resourceType: "payment",
			resourceId: args.paymentId,
			oldValues: { status: p.status },
			newValues: {
				status: "failed",
				reason: args.reason ?? "",
				processedAt: now,
			},
		});
		return args.paymentId;
	},
});

export const refund = mutation({
	args: {
		paymentId: v.id("payments"),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		const p = await ctx.db.get(args.paymentId);
		if (!p) throw new ConvexError("Payment not found");
		if (p.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		if (p.status !== "succeeded") {
			throw new ConvexError(
				`Only succeeded payments can be refunded (was ${p.status})`,
			);
		}
		// We just mark refunded here. The actual Stripe refund call
		// happens in payments_stripe_actions.ts (server action) before
		// this mutation runs. If the Stripe call fails, the row stays
		// at 'succeeded' and no refund is recorded.
		const now = Date.now();
		await ctx.db.patch(args.paymentId, {
			status: "refunded",
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: p.organizationId,
			userId: member.userId,
			action: "payment.refunded",
			resourceType: "payment",
			resourceId: args.paymentId,
			oldValues: { status: "succeeded" },
			newValues: {
				status: "refunded",
				reason: args.reason ?? "",
			},
		});
		return args.paymentId;
	},
});

// ----- Mutations: paymentSettings -----

export const upsertSettings = mutation({
	args: {
		stripeEnabled: v.boolean(),
		stripePublishableKey: v.string(),
		stripeSecretKey: v.string(), // plain; we encrypt on store
		stripeWebhookSecret: v.string(),
		stripeIsSandbox: v.boolean(),
		acceptDeposits: v.boolean(),
		depositPercentage: v.number(),
		defaultCurrency: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		// Encryption via convex/lib/crypto.
		const { encrypt } = await import("./lib/crypto");
		const secretEnc = await encrypt(args.stripeSecretKey);
		const webhookEnc = await encrypt(args.stripeWebhookSecret);

		const now = Date.now();
		const existing = await ctx.db
			.query("paymentSettings")
			.withIndex("by_org", (q) =>
				q.eq("organizationId", member.organizationId),
			)
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				stripeEnabled: args.stripeEnabled,
				stripePublishableKey: args.stripePublishableKey,
				stripeSecretKey: secretEnc,
				stripeWebhookSecret: webhookEnc,
				stripeIsSandbox: args.stripeIsSandbox,
				acceptDeposits: args.acceptDeposits,
				depositPercentage: args.depositPercentage,
				defaultCurrency: args.defaultCurrency,
				updatedAt: now,
			});
			return existing._id;
		}
		return await ctx.db.insert("paymentSettings", {
			organizationId: member.organizationId,
			stripeEnabled: args.stripeEnabled,
			stripePublishableKey: args.stripePublishableKey,
			stripeSecretKey: secretEnc,
			stripeWebhookSecret: webhookEnc,
			stripeIsSandbox: args.stripeIsSandbox,
			acceptDeposits: args.acceptDeposits,
			depositPercentage: args.depositPercentage,
			defaultCurrency: args.defaultCurrency,
			createdAt: now,
			updatedAt: now,
		});
	},
});

/** Internal helper: load encrypted Stripe secrets for the webhook + actions.
 * Returns the ciphertexts; the caller decrypts them (Web Crypto is
 * available in Convex actions via globalThis.crypto.subtle). */
export const getStripeSecrets = internalQuery({
	args: { organizationId: v.string() },
	handler: async (ctx, args) => {
		const s = await ctx.db
			.query("paymentSettings")
			.withIndex("by_org", (q) =>
				q.eq("organizationId", args.organizationId),
			)
			.unique();
		if (!s) return null;
		return {
			stripeSecretKey: s.stripeSecretKey,
			stripeWebhookSecret: s.stripeWebhookSecret,
			stripeIsSandbox: s.stripeIsSandbox,
			defaultCurrency: s.defaultCurrency,
		};
	},
});

/** Internal: load the booking (with orgId) for Stripe checkout. */
export const getBookingForCheckout = internalQuery({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, args) => {
		const b = await ctx.db.get(args.bookingId);
		if (!b) return null;
		return {
			organizationId: b.organizationId,
			status: b.status,
			totalAmountCents: b.totalAmountCents,
			customerId: b.customerId,
		};
	},
});

/** Internal: look up a payment by Stripe PaymentIntent ID, scoped to org. */
export const getPaymentByIntent = internalQuery({
	args: {
		stripePaymentIntentId: v.string(),
		organizationId: v.string(),
	},
	handler: async (ctx, args) => {
		const p = await ctx.db
			.query("payments")
			.withIndex("by_stripe_intent", (q) =>
				q.eq("stripePaymentIntentId", args.stripePaymentIntentId),
			)
			.unique();
		if (!p) return null;
		// Defense in depth: verify the payment belongs to the org
		// that claimed ownership via metadata.organizationId. This
		// blocks cross-tenant payment-status updates if a PaymentIntent
		// id ever leaks across orgs (Stripe re-use, manual data fix,
		// replay attack with re-routed metadata, etc.).
		if (p.organizationId !== args.organizationId) return null;
		return p._id;
	},
});

/** Internal: idempotent record-from-action (no role check). */
export const recordFromAction = internalMutation({
	args: {
		organizationId: v.string(),
		bookingId: v.id("bookings"),
		amountCents: v.int64(),
		currency: v.string(),
		stripePaymentIntentId: v.string(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("payments")
			.withIndex("by_stripe_intent", (q) =>
				q.eq("stripePaymentIntentId", args.stripePaymentIntentId),
			)
			.unique();
		if (existing) return existing._id;
		const now = Date.now();
		return await ctx.db.insert("payments", {
			organizationId: args.organizationId,
			bookingId: args.bookingId,
			amountCents: args.amountCents,
			currency: args.currency,
			status: "pending",
			provider: "stripe",
			stripePaymentIntentId: args.stripePaymentIntentId,
			createdAt: now,
			updatedAt: now,
		});
	},
});

/** Internal: mark refunded (called by webhook on charge.refunded). */
export const markRefunded = internalMutation({
	args: { paymentId: v.id("payments") },
	handler: async (ctx, args) => {
		const p = await ctx.db.get(args.paymentId);
		if (!p) throw new ConvexError("Payment not found");
		if (p.status === "refunded") return args.paymentId;
		const now = Date.now();
		await ctx.db.patch(args.paymentId, {
			status: "refunded",
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: p.organizationId,
			userId: "stripe_webhook",
			action: "payment.refunded",
			resourceType: "payment",
			resourceId: args.paymentId,
			oldValues: { status: p.status },
			newValues: { status: "refunded" },
		});
		return args.paymentId;
	},
});