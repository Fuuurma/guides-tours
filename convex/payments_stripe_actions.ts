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
//   1. Frontend calls createHostedCheckout (redirect) or
//      createCheckoutSession / createPublicPaymentIntent (Payment Element).
//   2. We create a Stripe Checkout Session or PaymentIntent
//      (automatic_payment_methods — no hardcoded payment_method_types).
//   3. We record a pending payment when a PI id is known; otherwise
//      checkout.session.completed / payment_intent.succeeded creates
//      the row from metadata, then marks it succeeded.
//   4. Stripe webhook hits /api/payments/stripe/webhook.

import {
	action,
	httpAction,
	type ActionCtx,
} from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { decrypt } from "./lib/crypto";
import { requireRole } from "./lib/authz";
import { normalizeEmail } from "./lib/validation";
import {
	parseStripeSignature,
	verifyStripeSignature,
} from "./payments_stripe";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

const COLLECTIBLE_STATUSES = new Set([
	"pending",
	"confirmed",
	"checked_in",
]);

type StripeObject = {
	id?: string;
	object?: string;
	amount?: number;
	amount_total?: number;
	currency?: string;
	payment_intent?: string | { id?: string } | null;
	metadata?: {
		organizationId?: string;
		bookingId?: string;
	};
	last_payment_error?: { message?: string };
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

function currencyForStripe(code: string): string {
	return code.toLowerCase();
}

function currencyForDb(code: string): string {
	return code.toUpperCase();
}

function paymentIntentIdFrom(obj: StripeObject | undefined): string | null {
	if (!obj) return null;
	const pi = obj.payment_intent;
	if (typeof pi === "string" && pi.startsWith("pi_")) return pi;
	if (pi && typeof pi === "object" && typeof pi.id === "string") {
		return pi.id;
	}
	// PaymentIntent events use object.id directly.
	if (typeof obj.id === "string" && obj.id.startsWith("pi_")) {
		return obj.id;
	}
	return null;
}

async function assertBookingCheckoutAllowed(
	ctx: ActionCtx,
	bookingId: string,
	organizationId: string,
	opts: {
		amountCents: bigint;
		balanceDueCents: bigint;
		status: string;
	},
): Promise<void> {
	if (organizationId === "") {
		throw new ConvexError("Booking missing organization");
	}
	if (!COLLECTIBLE_STATUSES.has(opts.status)) {
		throw new ConvexError(
			`Cannot collect payment for booking in status "${opts.status}"`,
		);
	}
	if (opts.amountCents <= 0n) {
		throw new ConvexError("Nothing to collect — amount must be positive");
	}
	if (opts.amountCents > opts.balanceDueCents) {
		throw new ConvexError(
			`Amount exceeds balance due (${opts.balanceDueCents} cents)`,
		);
	}
	void ctx;
	void bookingId;
}

// ----- Action: PaymentIntent for Stripe Payment Element -----
//
// Prefer hosted Checkout for simple redirects; use this when the
// dashboard/public book page embeds Payment Element in-app.

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
		publishableKey: string;
	}> => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);

		const booking = await ctx.runQuery(
			internal.payments.getBookingForCheckout,
			{ bookingId: args.bookingId },
		);
		if (!booking) throw new ConvexError("Booking not found");
		if (booking.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}

		await assertBookingCheckoutAllowed(ctx, args.bookingId, booking.organizationId, {
			amountCents: args.amountCents,
			balanceDueCents: booking.balanceDueCents ?? 0n,
			status: booking.status,
		});

		const settings = await ctx.runQuery(
			internal.payments.getStripeSecrets,
			{ organizationId: booking.organizationId },
		);
		if (!settings?.stripeSecretKey) {
			throw new ConvexError("Stripe is not configured for this org");
		}
		if (!settings.stripePublishableKey) {
			throw new ConvexError("Stripe publishable key is not configured");
		}
		const stripeSecret = await decrypt(settings.stripeSecretKey);
		const currencyDb = currencyForDb(
			args.currency ?? settings.defaultCurrency,
		);
		const currencyStripe = currencyForStripe(currencyDb);

		const params = new URLSearchParams();
		params.append("amount", args.amountCents.toString());
		params.append("currency", currencyStripe);
		// Dynamic payment methods — never hardcode payment_method_types.
		params.append("automatic_payment_methods[enabled]", "true");
		if (args.customerEmail) {
			params.append("receipt_email", args.customerEmail);
		} else if (booking.customerEmail) {
			params.append("receipt_email", booking.customerEmail);
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

		await ctx.runMutation(internal.payments.recordFromAction, {
			organizationId: booking.organizationId,
			bookingId: args.bookingId,
			amountCents: args.amountCents,
			currency: currencyDb,
			stripePaymentIntentId: intent.id,
		});

		return {
			stripePaymentIntentId: intent.id,
			clientSecret: intent.client_secret,
			amountCents: args.amountCents,
			currency: currencyDb,
			publishableKey: settings.stripePublishableKey,
		};
	},
});

/**
 * Public Payment Element intent — authenticated by bookingId + email
 * (same gate as createPublicHostedCheckout).
 */
export const createPublicPaymentIntent = action({
	args: {
		bookingId: v.id("bookings"),
		customerEmail: v.string(),
	},
	handler: async (
		ctx: ActionCtx,
		args,
	): Promise<{
		stripePaymentIntentId: string;
		clientSecret: string;
		amountCents: bigint;
		currency: string;
		publishableKey: string;
	}> => {
		const email = normalizeEmail(args.customerEmail);
		if (!email) throw new ConvexError("Invalid email address");

		const booking = await ctx.runQuery(
			internal.payments.getBookingForCheckout,
			{ bookingId: args.bookingId },
		);
		if (!booking) throw new ConvexError("Booking not found");
		if (!booking.customerEmail || booking.customerEmail !== email) {
			throw new ConvexError("Email does not match this booking");
		}

		const balance = booking.balanceDueCents ?? 0n;
		await assertBookingCheckoutAllowed(ctx, args.bookingId, booking.organizationId, {
			amountCents: balance,
			balanceDueCents: balance,
			status: booking.status,
		});

		const settings = await ctx.runQuery(
			internal.payments.getStripeSecrets,
			{ organizationId: booking.organizationId },
		);
		if (!settings?.stripeSecretKey || !settings.stripeEnabled) {
			throw new ConvexError("Online payment is not available for this operator");
		}
		if (!settings.stripePublishableKey) {
			throw new ConvexError("Stripe publishable key is not configured");
		}
		const stripeSecret = await decrypt(settings.stripeSecretKey);
		const currencyDb = currencyForDb(settings.defaultCurrency);
		const currencyStripe = currencyForStripe(currencyDb);

		const params = new URLSearchParams();
		params.append("amount", balance.toString());
		params.append("currency", currencyStripe);
		params.append("automatic_payment_methods[enabled]", "true");
		params.append("receipt_email", email);
		params.append("metadata[bookingId]", args.bookingId);
		params.append("metadata[organizationId]", booking.organizationId);
		params.append("description", `Tour booking ${args.bookingId}`);

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
		};

		await ctx.runMutation(internal.payments.recordFromAction, {
			organizationId: booking.organizationId,
			bookingId: args.bookingId,
			amountCents: balance,
			currency: currencyDb,
			stripePaymentIntentId: intent.id,
		});

		return {
			stripePaymentIntentId: intent.id,
			clientSecret: intent.client_secret,
			amountCents: balance,
			currency: currencyDb,
			publishableKey: settings.stripePublishableKey,
		};
	},
});

/**
 * Hosted Stripe Checkout — redirects to Stripe's payment page.
 * Prefer Payment Element (`createCheckoutSession`) when collecting
 * in-app; keep hosted Checkout as the fallback redirect path.
 */
export const createHostedCheckout = action({
	args: {
		bookingId: v.id("bookings"),
		amountCents: v.optional(v.int64()),
		successPath: v.optional(v.string()),
		cancelPath: v.optional(v.string()),
	},
	handler: async (
		ctx: ActionCtx,
		args,
	): Promise<{ url: string; sessionId: string }> => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);

		const booking = await ctx.runQuery(
			internal.payments.getBookingForCheckout,
			{ bookingId: args.bookingId },
		);
		if (!booking) throw new ConvexError("Booking not found");
		if (booking.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}

		const balance = booking.balanceDueCents ?? 0n;
		const amountCents = args.amountCents ?? balance;
		await assertBookingCheckoutAllowed(ctx, args.bookingId, booking.organizationId, {
			amountCents,
			balanceDueCents: balance,
			status: booking.status,
		});

		const settings = await ctx.runQuery(
			internal.payments.getStripeSecrets,
			{ organizationId: booking.organizationId },
		);
		if (!settings?.stripeSecretKey) {
			throw new ConvexError("Stripe is not configured for this org");
		}
		const stripeSecret = await decrypt(settings.stripeSecretKey);
		const currencyDb = currencyForDb(settings.defaultCurrency);
		const currencyStripe = currencyForStripe(currencyDb);

		const siteUrl = process.env.SITE_URL ?? "http://127.0.0.1:3020";
		const successPath =
			args.successPath ??
			`/dashboard/bookings/${args.bookingId}?paid=1`;
		const cancelPath =
			args.cancelPath ?? `/dashboard/bookings/${args.bookingId}`;

		const params = new URLSearchParams();
		params.append("mode", "payment");
		params.append("success_url", `${siteUrl}${successPath}`);
		params.append("cancel_url", `${siteUrl}${cancelPath}`);
		params.append("line_items[0][quantity]", "1");
		params.append("line_items[0][price_data][currency]", currencyStripe);
		params.append(
			"line_items[0][price_data][unit_amount]",
			amountCents.toString(),
		);
		params.append(
			"line_items[0][price_data][product_data][name]",
			`Booking ${args.bookingId}`,
		);
		params.append("metadata[bookingId]", args.bookingId);
		params.append("metadata[organizationId]", booking.organizationId);
		params.append(
			"payment_intent_data[metadata][bookingId]",
			args.bookingId,
		);
		params.append(
			"payment_intent_data[metadata][organizationId]",
			booking.organizationId,
		);
		// Expand so we can record a pending row when Stripe already
		// allocated a PaymentIntent at session create.
		params.append("expand[]", "payment_intent");
		if (booking.customerEmail) {
			params.append("customer_email", booking.customerEmail);
		}

		const res = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
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
				`Stripe Checkout error: ${res.status} ${errText.slice(0, 200)}`,
			);
		}
		const session = (await res.json()) as {
			id: string;
			url: string | null;
			payment_intent?: string | { id?: string } | null;
		};
		if (!session.url) {
			throw new ConvexError("Stripe Checkout session missing URL");
		}

		const piId = paymentIntentIdFrom({
			payment_intent: session.payment_intent,
		});
		if (piId) {
			await ctx.runMutation(internal.payments.recordFromAction, {
				organizationId: booking.organizationId,
				bookingId: args.bookingId,
				amountCents,
				currency: currencyDb,
				stripePaymentIntentId: piId,
			});
		}
		// If no PI yet, checkout.session.completed / payment_intent.succeeded
		// will create the pending row from metadata then mark it succeeded.

		return { url: session.url, sessionId: session.id };
	},
});

/**
 * Public (guest) hosted Checkout after a public booking is created.
 * Authenticated by bookingId + matching customer email — not session auth.
 */
export const createPublicHostedCheckout = action({
	args: {
		bookingId: v.id("bookings"),
		customerEmail: v.string(),
		successPath: v.optional(v.string()),
		cancelPath: v.optional(v.string()),
	},
	handler: async (
		ctx: ActionCtx,
		args,
	): Promise<{ url: string; sessionId: string }> => {
		const email = normalizeEmail(args.customerEmail);
		if (!email) throw new ConvexError("Invalid email address");

		const booking = await ctx.runQuery(
			internal.payments.getBookingForCheckout,
			{ bookingId: args.bookingId },
		);
		if (!booking) throw new ConvexError("Booking not found");
		if (!booking.customerEmail || booking.customerEmail !== email) {
			throw new ConvexError("Email does not match this booking");
		}

		const balance = booking.balanceDueCents ?? 0n;
		await assertBookingCheckoutAllowed(ctx, args.bookingId, booking.organizationId, {
			amountCents: balance,
			balanceDueCents: balance,
			status: booking.status,
		});

		const settings = await ctx.runQuery(
			internal.payments.getStripeSecrets,
			{ organizationId: booking.organizationId },
		);
		if (!settings?.stripeSecretKey || !settings.stripeEnabled) {
			throw new ConvexError("Online payment is not available for this operator");
		}
		const stripeSecret = await decrypt(settings.stripeSecretKey);
		const currencyDb = currencyForDb(settings.defaultCurrency);
		const currencyStripe = currencyForStripe(currencyDb);

		const siteUrl = process.env.SITE_URL ?? "http://127.0.0.1:3020";
		const successPath =
			args.successPath ?? `/book/paid?bookingId=${args.bookingId}`;
		const cancelPath =
			args.cancelPath ?? `/book/paid?bookingId=${args.bookingId}&cancelled=1`;

		const params = new URLSearchParams();
		params.append("mode", "payment");
		params.append("success_url", `${siteUrl}${successPath}`);
		params.append("cancel_url", `${siteUrl}${cancelPath}`);
		params.append("line_items[0][quantity]", "1");
		params.append("line_items[0][price_data][currency]", currencyStripe);
		params.append(
			"line_items[0][price_data][unit_amount]",
			balance.toString(),
		);
		params.append(
			"line_items[0][price_data][product_data][name]",
			`Tour booking ${args.bookingId}`,
		);
		params.append("metadata[bookingId]", args.bookingId);
		params.append("metadata[organizationId]", booking.organizationId);
		params.append(
			"payment_intent_data[metadata][bookingId]",
			args.bookingId,
		);
		params.append(
			"payment_intent_data[metadata][organizationId]",
			booking.organizationId,
		);
		params.append("expand[]", "payment_intent");
		params.append("customer_email", email);

		const res = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
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
				`Stripe Checkout error: ${res.status} ${errText.slice(0, 200)}`,
			);
		}
		const session = (await res.json()) as {
			id: string;
			url: string | null;
			payment_intent?: string | { id?: string } | null;
		};
		if (!session.url) {
			throw new ConvexError("Stripe Checkout session missing URL");
		}

		const piId = paymentIntentIdFrom({
			payment_intent: session.payment_intent,
		});
		if (piId) {
			await ctx.runMutation(internal.payments.recordFromAction, {
				organizationId: booking.organizationId,
				bookingId: args.bookingId,
				amountCents: balance,
				currency: currencyDb,
				stripePaymentIntentId: piId,
			});
		}

		return { url: session.url, sessionId: session.id };
	},
});

/**
 * Refund via Stripe API, then mark the local payment refunded.
 * Dashboard "Refund" must call this — not payments.refund alone.
 */
export const refundViaStripe = action({
	args: {
		paymentId: v.id("payments"),
		reason: v.optional(v.string()),
	},
	handler: async (
		ctx: ActionCtx,
		args,
	): Promise<{ paymentId: string; stripeRefundId: string }> => {
		const member = await requireRole(ctx, ["owner", "admin"]);

		const payment = await ctx.runQuery(internal.payments.getPaymentForRefund, {
			paymentId: args.paymentId,
		});
		if (!payment) throw new ConvexError("Payment not found");
		if (payment.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		if (payment.status !== "succeeded") {
			throw new ConvexError(
				`Only succeeded payments can be refunded (was ${payment.status})`,
			);
		}
		if (!payment.stripePaymentIntentId.startsWith("pi_")) {
			throw new ConvexError("Payment has no Stripe PaymentIntent to refund");
		}

		const settings = await ctx.runQuery(
			internal.payments.getStripeSecrets,
			{ organizationId: payment.organizationId },
		);
		if (!settings?.stripeSecretKey) {
			throw new ConvexError("Stripe is not configured for this org");
		}
		const stripeSecret = await decrypt(settings.stripeSecretKey);

		const params = new URLSearchParams();
		params.append("payment_intent", payment.stripePaymentIntentId);
		if (args.reason) {
			params.append("reason", "requested_by_customer");
			params.append("metadata[dashboard_reason]", args.reason.slice(0, 200));
		}

		const res = await fetch(`${STRIPE_API_BASE}/refunds`, {
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
				`Stripe refund error: ${res.status} ${errText.slice(0, 200)}`,
			);
		}
		const refund = (await res.json()) as {
			id: string;
			amount: number;
			currency: string;
			reason?: string;
			created?: number;
		};

		await ctx.runMutation(internal.payments.markRefunded, {
			paymentId: args.paymentId,
			refund: {
				stripeRefundId: refund.id,
				amountCents: BigInt(refund.amount),
				currency: currencyForDb(refund.currency),
				reason: args.reason ?? refund.reason,
				processedAt: refund.created ? refund.created * 1000 : undefined,
			},
		});

		return { paymentId: args.paymentId, stripeRefundId: refund.id };
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

	const rawBody = await request.text();

	let parsed: {
		id?: string;
		type?: string;
		data?: { object?: StripeObject };
	};
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		return new Response("invalid JSON", { status: 400 });
	}

	const obj = parsed?.data?.object;
	const eventType = parsed.type;

	// Resolve org for webhook-secret lookup. Prefer metadata; for
	// charge.refunded (often missing org metadata) fall back to the
	// PaymentIntent id → local payment row.
	let orgId = obj?.metadata?.organizationId;
	if (!orgId) {
		const piForLookup = paymentIntentIdFrom(obj);
		if (piForLookup) {
			const row = await ctx.runQuery(
				internal.payments.getPaymentRowByIntent,
				{ stripePaymentIntentId: piForLookup },
			);
			orgId = row?.organizationId;
		}
	}
	if (!orgId) {
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

	const stripeEventId = parsed.id;
	if (stripeEventId) {
		const recorded = await ctx.runMutation(
			internal.webhookDeliveries.recordDelivery,
			{
				organizationId: orgId,
				source: "stripe",
				eventId: stripeEventId,
				eventType: eventType ?? "unknown",
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

	try {
		if (
			eventType === "payment_intent.succeeded" ||
			eventType === "checkout.session.completed"
		) {
			const piId = paymentIntentIdFrom(obj);
			const bookingId = obj?.metadata?.bookingId;
			const amountRaw =
				typeof obj?.amount_total === "number"
					? obj.amount_total
					: typeof obj?.amount === "number"
						? obj.amount
						: null;
			const currencyRaw = obj?.currency;

			if (!piId) {
				console.log(
					`[stripe-webhook] ${eventType} missing payment_intent (org=${orgId})`,
				);
				// Ack — Checkout may complete without a PI in edge cases;
				// retrying won't help until Stripe sends a PI event.
			} else {
				let paymentId = await ctx.runQuery(
					internal.payments.getPaymentByIntent,
					{ stripePaymentIntentId: piId, organizationId: orgId },
				);

				if (!paymentId && bookingId && amountRaw != null && currencyRaw) {
					paymentId = await ctx.runMutation(
						internal.payments.recordFromAction,
						{
							organizationId: orgId,
							bookingId: bookingId as never,
							amountCents: BigInt(amountRaw),
							currency: currencyForDb(currencyRaw),
							stripePaymentIntentId: piId,
						},
					);
				}

				if (!paymentId) {
					console.log(
						`[stripe-webhook] unknown intent ${piId} (event=${eventType}, org=${orgId})`,
					);
				} else {
					await ctx.runMutation(internal.payments.markSucceeded, {
						paymentId,
					});
				}
			}
		} else if (eventType === "payment_intent.payment_failed") {
			const piId = paymentIntentIdFrom(obj);
			if (!piId) {
				return new Response("missing intent id", { status: 400 });
			}
			const paymentId = await ctx.runQuery(
				internal.payments.getPaymentByIntent,
				{ stripePaymentIntentId: piId, organizationId: orgId },
			);
			if (!paymentId) {
				console.log(
					`[stripe-webhook] unknown/cross-org intent ${piId} (event=${eventType}, org=${orgId})`,
				);
			} else {
				await ctx.runMutation(internal.payments.markFailed, {
					paymentId,
					reason: obj?.last_payment_error?.message ?? undefined,
				});
			}
		} else if (eventType === "charge.refunded") {
			const piId = paymentIntentIdFrom(obj);
			if (!piId) {
				console.log(
					`[stripe-webhook] charge.refunded missing payment_intent (org=${orgId})`,
				);
			} else {
				const paymentId = await ctx.runQuery(
					internal.payments.getPaymentByIntent,
					{ stripePaymentIntentId: piId, organizationId: orgId },
				);
				if (!paymentId) {
					console.log(
						`[stripe-webhook] unknown intent ${piId} for charge.refunded (org=${orgId})`,
					);
				} else {
					const refundsData = obj?.refunds?.data ?? [];
					const lastRefund = refundsData[refundsData.length - 1];
					const refund = lastRefund
						? {
								stripeRefundId: lastRefund.id,
								amountCents: BigInt(lastRefund.amount),
								currency: currencyForDb(lastRefund.currency),
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
		}

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

void parseStripeSignature;
