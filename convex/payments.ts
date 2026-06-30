// Payments CRUD + Stripe integration helpers.
//
// Source: backend/tours/services/payments/stripe.py
//         backend/tours/services/payments/interface.py
//         backend/tours/api_payments.py
//
// Payment mutations:
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
import {
	CURRENCY_REGEX,
	MAX_STRIPE_INTENT_ID_LEN,
	MIN_DEPOSIT_PERCENTAGE,
	MAX_DEPOSIT_PERCENTAGE,
	assertFieldWithinLimit,
} from "./lib/validation";

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
		// Validate currency shape (ISO 4217) and stripe intent id length.
		// The FE sends validated values, but any Convex client can call
		// this — defending in depth keeps the table clean.
		if (!CURRENCY_REGEX.test(args.currency)) {
			throw new ConvexError(
				`Invalid currency: "${args.currency}" must be 3 uppercase letters`,
			);
		}
		assertFieldWithinLimit(
			"stripePaymentIntentId",
			args.stripePaymentIntentId,
			MAX_STRIPE_INTENT_ID_LEN,
		);
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
 * admin action). Idempotent for already-succeeded rows. Refuses
 * to overwrite failed/refunded rows — Stripe webhooks can re-deliver
 * events, but we must not silently resurrect a failed payment.
 */
export const markSucceeded = internalMutation({
	args: {
		paymentId: v.id("payments"),
	},
	handler: async (ctx, args) => {
		const p = await ctx.db.get(args.paymentId);
		if (!p) throw new ConvexError("Payment not found");
		if (p.status === "succeeded") return args.paymentId;
		if (p.status !== "pending") {
			throw new ConvexError(
				`Cannot mark non-pending payment as succeeded (was ${p.status})`,
			);
		}
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

/**
 * Mark a payment failed (called by Stripe webhook). Idempotent for
 * already-failed rows. Refuses to overwrite succeeded/refunded rows
 * — a late "payment_failed" event must not void a real charge.
 */
export const markFailed = internalMutation({
	args: {
		paymentId: v.id("payments"),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const p = await ctx.db.get(args.paymentId);
		if (!p) throw new ConvexError("Payment not found");
		if (p.status === "failed") return args.paymentId;
		if (p.status !== "pending") {
			throw new ConvexError(
				`Cannot mark non-pending payment as failed (was ${p.status})`,
			);
		}
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

/**
 * @internal
 * No FE caller as of 2026-06-29. Stripe webhook handles automatic refunds
 * via charge.refunded events. Kept as a public mutation so it can be
 * wired to a "refund" button in the bookings detail page when needed.
 * See docs/DATA_LAYER_STATUS.md for the current dead-surface list.
 */
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
		// Write a refunds row so the dashboard's refund history is
		// consistent across manual + webhook-initiated refunds.
		// Synthesize a stripeRefundId prefixed with "manual_" — this
		// distinguishes manual refunds from real Stripe ones and
		// keeps the (source, eventId) idempotency key unique.
		await ctx.db.insert("refunds", {
			organizationId: p.organizationId,
			paymentId: p._id,
			stripeRefundId: `manual_${now}_${args.paymentId}`,
			amountCents: p.amountCents,
			currency: p.currency,
			status: "succeeded",
			reason: args.reason,
			refundedBy: member.userId,
			refundedAt: now,
			processedAt: now,
			metadata: { source: "dashboard_manual_refund" },
			createdAt: now,
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

		// Validate inputs before touching secrets
		if (args.depositPercentage < MIN_DEPOSIT_PERCENTAGE || args.depositPercentage > MAX_DEPOSIT_PERCENTAGE) {
			throw new ConvexError(
				`depositPercentage must be between ${MIN_DEPOSIT_PERCENTAGE} and ${MAX_DEPOSIT_PERCENTAGE}`,
			);
		}
		if (!CURRENCY_REGEX.test(args.defaultCurrency)) {
			throw new ConvexError("Invalid currency: must be 3 uppercase letters (e.g. USD)");
		}
		const { encrypt } = await import("./lib/crypto");

		const now = Date.now();
		const existing = await ctx.db
			.query("paymentSettings")
			.withIndex("by_org", (q) =>
				q.eq("organizationId", member.organizationId),
			)
			.unique();

		// When the FE can't read back secrets it sends the literal
		// "placeholder-no-change".  Keep the existing ciphertext so we
		// don't overwrite a real secret with junk.
		const SECRET_PLACEHOLDER = "placeholder-no-change";
		const secretEnc =
			existing &&
			args.stripeSecretKey === SECRET_PLACEHOLDER
				? existing.stripeSecretKey
				: await encrypt(args.stripeSecretKey);
		const webhookEnc =
			existing &&
			args.stripeWebhookSecret === SECRET_PLACEHOLDER
				? existing.stripeWebhookSecret
				: await encrypt(args.stripeWebhookSecret);

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

/** Internal mirror of upsertSettings for tests. Takes orgId directly. */
export const upsertSettingsInternal = internalMutation({
	args: {
		stripeEnabled: v.boolean(),
		stripePublishableKey: v.string(),
		stripeSecretKey: v.string(),
		stripeWebhookSecret: v.string(),
		stripeIsSandbox: v.boolean(),
		acceptDeposits: v.boolean(),
		depositPercentage: v.number(),
		defaultCurrency: v.string(),
		_organizationId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const orgId = args._organizationId!;

		// Validate inputs before touching secrets (defense in depth)
		if (args.depositPercentage < MIN_DEPOSIT_PERCENTAGE || args.depositPercentage > MAX_DEPOSIT_PERCENTAGE) {
			throw new ConvexError(
				`depositPercentage must be between ${MIN_DEPOSIT_PERCENTAGE} and ${MAX_DEPOSIT_PERCENTAGE}`,
			);
		}
		if (!CURRENCY_REGEX.test(args.defaultCurrency)) {
			throw new ConvexError("Invalid currency: must be 3 uppercase letters (e.g. USD)");
		}

		const { encrypt } = await import("./lib/crypto");

		const now = Date.now();
		const existing = await ctx.db
			.query("paymentSettings")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId))
			.unique();

		const SECRET_PLACEHOLDER = "placeholder-no-change";
		const secretEnc =
			existing && args.stripeSecretKey === SECRET_PLACEHOLDER
				? existing.stripeSecretKey
				: await encrypt(args.stripeSecretKey);
		const webhookEnc =
			existing && args.stripeWebhookSecret === SECRET_PLACEHOLDER
				? existing.stripeWebhookSecret
				: await encrypt(args.stripeWebhookSecret);

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
			organizationId: orgId,
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
		// Same validation as the public record mutation — internal callers
		// (public booking flow, refunds action, webhook) all need to
		// send a valid currency + bounded intent id.
		if (!CURRENCY_REGEX.test(args.currency)) {
			throw new ConvexError(
				`Invalid currency: "${args.currency}" must be 3 uppercase letters`,
			);
		}
		assertFieldWithinLimit(
			"stripePaymentIntentId",
			args.stripePaymentIntentId,
			MAX_STRIPE_INTENT_ID_LEN,
		);

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

/** Internal: mark refunded (called by webhook on charge.refunded).
 *  Idempotent for already-refunded rows. Refuses to mark non-succeeded
 *  rows as refunded — Stripe can re-deliver charge.refunded for a
 *  cancelled/failed PaymentIntent, but we must not claim a refund
 *  for a charge that never landed.
 *
 *  Optionally writes a refunds row when refund details are provided
 *  (from the Stripe webhook payload). */
export const markRefunded = internalMutation({
	args: {
		paymentId: v.id("payments"),
		// Optional refund details from the Stripe webhook. When present,
		// a corresponding row is written to the refunds table.
		refund: v.optional(
			v.object({
				stripeRefundId: v.string(),
				amountCents: v.int64(),
				currency: v.string(),
				reason: v.optional(v.string()),
				processedAt: v.optional(v.number()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const p = await ctx.db.get(args.paymentId);
		if (!p) throw new ConvexError("Payment not found");
		if (p.status === "refunded") {
			// Idempotent — but if a refund row is missing, backfill it.
			if (args.refund) {
				const existing = await ctx.db
					.query("refunds")
					.withIndex("by_stripe_refund", (q) =>
						q.eq("stripeRefundId", args.refund!.stripeRefundId),
					)
					.first();
				if (!existing) {
					await ctx.db.insert("refunds", {
						organizationId: p.organizationId,
						paymentId: p._id,
						stripeRefundId: args.refund.stripeRefundId,
						amountCents: args.refund.amountCents,
						currency: args.refund.currency,
						status: "succeeded",
						reason: args.refund.reason,
						refundedBy: "stripe_webhook",
						refundedAt: Date.now(),
						processedAt: args.refund.processedAt ?? Date.now(),
						metadata: {},
						createdAt: Date.now(),
						updatedAt: Date.now(),
					});
				}
			}
			return args.paymentId;
		}
		if (p.status !== "succeeded") {
			throw new ConvexError(
				`Cannot mark non-succeeded payment as refunded (was ${p.status})`,
			);
		}
		const now = Date.now();
		await ctx.db.patch(args.paymentId, {
			status: "refunded",
			updatedAt: now,
		});
		// Write the refunds row when details are present.
		if (args.refund) {
			await ctx.db.insert("refunds", {
				organizationId: p.organizationId,
				paymentId: p._id,
				stripeRefundId: args.refund.stripeRefundId,
				amountCents: args.refund.amountCents,
				currency: args.refund.currency,
				status: "succeeded",
				reason: args.refund.reason,
				refundedBy: "stripe_webhook",
				refundedAt: now,
				processedAt: args.refund.processedAt ?? now,
				metadata: {},
				createdAt: now,
				updatedAt: now,
			});
		}
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