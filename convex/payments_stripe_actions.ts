// Stripe Checkout / PaymentIntent actions + webhook.
//
// Source: backend/tours/services/payments/stripe.py
//         backend/tours/api_payments.py
//
// We hit Stripe's REST API via fetch (no node:crypto, no Stripe SDK).
// 'use node' is needed for fetch + for full Buffer support (Stripe
// sends a Uint8Array in webhook raw bodies).
//
// Flow:
//   1. Frontend calls createCheckoutSession (action) with
//      bookingId, amountCents, currency.
//   2. We call Stripe's /v1/payment_intents endpoint.
//   3. We call internal.payments.record() with the intent ID.
//   4. Return the client_secret to the frontend.
//   5. Stripe webhook hits /api/payments/stripe/webhook.
//   6. The httpAction verifies the signature + dispatches the event
//      to markSucceeded/markFailed.

import {
	action,
	httpAction,
	type ActionCtx,
} from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { decrypt } from "./lib/crypto";
import {
	parseStripeSignature,
	verifyStripeSignature,
} from "./payments_stripe";

const STRIPE_API_BASE = "https://api.stripe.com/v1";
// Stripe's API is the same URLs for test/live — the key determines
// which mode. We use it for both live and sandbox (sandbox uses
// `sk_test_*` keys but the same endpoint).

// ----- Action: create a PaymentIntent for a booking -----

export const createCheckoutSession = action({
	args: {
		bookingId: v.id("bookings"),
		amountCents: v.int64(),
		currency: v.optional(v.string()),
		customerEmail: v.optional(v.string()),
		description: v.optional(v.string()),
	},
	handler: async (
		ctx: ActionCtx,
		args,
	): Promise<{
		stripePaymentIntentId: string;
		clientSecret: string;
		amountCents: bigint;
		currency: string;
	}> => {
		// 1. Load booking + org + settings.
		const booking = await ctx.runQuery(
			internal.payments.getBookingForCheckout,
			{ bookingId: args.bookingId },
		);
		if (!booking) throw new ConvexError("Booking not found");

		const settings = await ctx.runQuery(
			internal.payments.getStripeSecrets,
			{ organizationId: booking.organizationId },
		);
		if (!settings) {
			throw new ConvexError("Stripe is not configured for this org");
		}
		if (!settings.stripeSecretKey) {
			throw new ConvexError("Stripe secret key missing");
		}
		const stripeSecret = await decrypt(settings.stripeSecretKey);
		const currency = (args.currency ?? settings.defaultCurrency).toLowerCase();

		// 2. Call Stripe's PaymentIntent endpoint.
		const params = new URLSearchParams();
		params.append("amount", args.amountCents.toString());
		params.append("currency", currency);
		if (args.customerEmail) {
			params.append("receipt_email", args.customerEmail);
		}
		params.append("metadata[bookingId]", args.bookingId);
		params.append("metadata[organizationId]", booking.organizationId);
		if (args.description) {
			params.append("description", args.description);
		}

		const res = await fetch(`${STRIPE_API_BASE}/payment_intents`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${stripeSecret}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: params.toString(),
		});

		if (!res.ok) {
			const errText = await res.text();
			throw new ConvexError(
				`Stripe error: ${res.status} ${errText.slice(0, 200)}`,
			);
		}
		const intent = (await res.json()) as {
			id: string;
			client_secret: string;
			amount: number;
			currency: string;
		};

		// 3. Record the pending payment locally. Idempotent by intent id.
		await ctx.runMutation(internal.payments.recordFromAction, {
			organizationId: booking.organizationId,
			bookingId: args.bookingId,
			amountCents: args.amountCents,
			currency,
			stripePaymentIntentId: intent.id,
		});

		return {
			stripePaymentIntentId: intent.id,
			clientSecret: intent.client_secret,
			amountCents: args.amountCents,
			currency,
		};
	},
});

// ----- HTTP action: Stripe webhook receiver -----

export const stripeWebhook = httpAction(async (ctx, request) => {
	if (request.method !== "POST") {
		return new Response("method not allowed", { status: 405 });
	}
	const sigHeader = request.headers.get("stripe-signature");
	if (!sigHeader) {
		return new Response("missing signature", { status: 400 });
	}

	// Stripe signature verification needs the raw body. Convex's
	// request.text() gives us the body as a string — Stripe
	// recommends passing the raw bytes, but for HMAC purposes the
	// string form is identical (no encoding ambiguity).
	const rawBody = await request.text();

	// Find the paymentSettings row via metadata.organizationId.
	// The event payload includes our metadata so we can do the
	// org lookup without a URL parameter.
	let parsed: {
		// Stripe event id (e.g. "evt_...") — top-level, globally unique
		// per Stripe. Used for idempotency in webhookDeliveries.
		id?: string;
		type?: string;
		data?: {
			object?: {
				id?: string;
				metadata?: { organizationId?: string };
				refunds?: {
					data?: Array<{
						id: string;
						amount: number;
						currency: string;
						reason?: string;
						created?: number;
					}>;
				};
			};
		};
	};
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		return new Response("invalid JSON", { status: 400 });
	}
	const orgId = parsed?.data?.object?.metadata?.organizationId;
	if (!orgId) {
		// No org context — likely a different Stripe account's webhook
		// hitting our endpoint by mistake. Ack so Stripe stops retrying.
		return new Response("ignored (no org metadata)", { status: 200 });
	}

	const settings = await ctx.runQuery(internal.payments.getStripeSecrets, {
		organizationId: orgId,
	});
	if (!settings?.stripeWebhookSecret) {
		return new Response("no webhook secret configured", { status: 500 });
	}
	const webhookSecret = await decrypt(settings.stripeWebhookSecret);

	const valid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
	if (!valid) {
		return new Response("invalid signature", { status: 401 });
	}

	// Idempotency: record the delivery (deduped on Stripe event id)
	// before processing. Re-deliveries of the same event are skipped.
	const stripeEventId = parsed.id;
	if (stripeEventId) {
		const recorded = await ctx.runMutation(
			internal.webhookDeliveries.recordDelivery,
			{
				organizationId: orgId,
				source: "stripe",
				eventId: stripeEventId,
				eventType: parsed.type ?? "unknown",
				ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
				userAgent: request.headers.get("user-agent") ?? undefined,
				payload: parsed,
			},
		);
		if (recorded.isDuplicate) {
			console.log(
				`[stripe-webhook] duplicate event ${stripeEventId} for org ${orgId}`,
			);
			return new Response("ok (duplicate)", { status: 200 });
		}
	}

	// Dispatch on event type. Source: api_payments.py:279-310.
	const eventType = parsed.type;
	try {
		if (
			eventType === "payment_intent.succeeded" ||
			eventType === "payment_intent.payment_failed" ||
			eventType === "charge.refunded"
		) {
		const intentId = parsed.data?.object?.id;
		if (!intentId) {
			return new Response("missing intent id", { status: 400 });
		}
		const paymentId = await ctx.runQuery(
			internal.payments.getPaymentByIntent,
			{ stripePaymentIntentId: intentId, organizationId: orgId },
		);
		if (!paymentId) {
			// We don't know about this intent — or it belongs to
			// a different org. Either way, ack so Stripe stops
			// retrying but never update a payment we don't own.
			console.log(
				`[stripe-webhook] unknown/cross-org intent ${intentId} (event=${eventType}, org=${orgId})`,
			);
			return new Response("ok", { status: 200 });
		}

		if (eventType === "payment_intent.succeeded") {
			await ctx.runMutation(internal.payments.markSucceeded, { paymentId });
		} else if (eventType === "payment_intent.payment_failed") {
			await ctx.runMutation(internal.payments.markFailed, {
				paymentId,
				reason:
					(
						parsed.data?.object as
							| { last_payment_error?: { message?: string } }
							| undefined
					)?.last_payment_error?.message ?? undefined,
			});
		} else if (eventType === "charge.refunded") {
			// Pull refund details from the Charge payload so we can write
			// a refunds row (idempotent — markRefunded dedupes by
			// stripeRefundId). `refunds.data` is a list of refund objects;
			// we record the most recent one (last in the array, per
			// Stripe's API order).
			const charge = parsed.data?.object;
			const refundsData = (charge?.refunds?.data ?? []) as Array<{
				id: string;
				amount: number;
				currency: string;
				reason?: string;
				created?: number;
			}>;
			const lastRefund = refundsData[refundsData.length - 1];
			const refund = lastRefund
				? {
						stripeRefundId: lastRefund.id,
						amountCents: BigInt(lastRefund.amount),
						currency: lastRefund.currency.toUpperCase(),
						reason: lastRefund.reason,
						processedAt: lastRefund.created
							? lastRefund.created * 1000
							: undefined,
					}
				: undefined;
			await ctx.runMutation(internal.payments.markRefunded, {
				paymentId,
				refund,
			});
		}
	}

	// Mark the delivery as processed (or failed if a mutation threw).
	if (stripeEventId) {
		await ctx.runMutation(
			internal.webhookDeliveries.updateDeliveryStatus,
			{
				source: "stripe",
				eventId: stripeEventId,
				status: "processed",
			},
		);
	}
	} catch (err) {
		if (stripeEventId) {
			await ctx.runMutation(
				internal.webhookDeliveries.updateDeliveryStatus,
				{
					source: "stripe",
					eventId: stripeEventId,
					status: "failed",
					errorMessage:
						err instanceof Error ? err.message : String(err),
				},
			);
		}
		throw err;
	}

	return new Response("ok", { status: 200 });
});

// Suppress lint warning for the imported helper (re-exported for tests).
void parseStripeSignature;
