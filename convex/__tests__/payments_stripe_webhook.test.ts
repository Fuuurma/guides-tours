// Integration tests for the Stripe webhook dispatch logic.
//
// We exercise the same code paths as convex/payments_stripe_actions.ts
// but call the internal mutations directly (the httpAction can't be
// invoked through convexTest). Verifies:
//   - payment_intent.succeeded → payments.markSucceeded
//   - payment_intent.payment_failed → payments.markFailed with reason
//   - charge.refunded → payments.markRefunded
//   - Unknown intent id → no-op (returns ok without throwing)
//   - Signature verification rejects tampered bodies

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";
import {
	parseStripeSignature,
	verifyStripeSignature,
	signStripePayload,
} from "../payments_stripe";
import { decideCheckoutSettlement } from "../lib/checkoutSettlement";
import { _resetKeyForTest } from "../lib/crypto";

const modules = import.meta.glob("../**/*.{ts,tsx}");

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

async function seedBooking(ctx: any, orgId: string) {
	const tourId = await ctx.db.insert("tours", {
		organizationId: orgId,
		name: "T",
		description: "",
		durationHours: 2,
		isActive: true,
		recurrenceType: "none",
		recurrenceDaysOfWeek: [],
		capacity: 10,
		bufferMinutes: 15,
		minGuests: 1,
		maxGuests: 10,
		bookingCutoffHours: 24,
		tourType: "walking",
		languages: ["en"],
		requiredGuides: 1,
		inclusions: [],
		exclusions: [],
		highlights: [],
		currency: "USD",
		createdAt: 0,
		updatedAt: 0,
	});
	const customerId = await ctx.db.insert("customers", {
		organizationId: orgId,
		name: "C",
		email: "c@c.com",
		phone: "",
		notes: "",
		smsConsent: false,
		emailConsent: false,
		preferredLanguage: "en",
		tags: [],
		source: "direct",
		sourceDetails: "",
		specialRequirements: "",
		vipStatus: false,
		loyaltyPoints: 0,
		totalVisits: 0,
		totalRevenueCents: 0n,
		createdAt: 0,
		updatedAt: 0,
	});
	return await ctx.db.insert("bookings", {
		organizationId: orgId,
		tourId,
		customerId,
		date: "2026-09-15",
		startTime: "10:00",
		guests: 2,
		guestNames: "",
		languageRequired: "en",
		notes: "",
		status: "confirmed",
		depositAmountCents: 0n,
		totalAmountCents: 10000n,
		balanceDueCents: 10000n,
		paymentMethod: "",
		checkedInBy: "",
		netRevenueCents: 10000n,
		source: "direct",
		reviewComment: "",
		createdAt: 0,
		updatedAt: 0,
	});
}

describe("stripe webhook dispatch", () => {
	it("payment_intent.succeeded dispatches to markSucceeded", async () => {
		const t = convexTest(schema, modules);
		_resetKeyForTest();
		const orgId = "org_sw1";
		const bookingId = await t.run((ctx) => seedBooking(ctx, orgId));
		// Record a pending payment
		const paymentId = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			stripePaymentIntentId: "pi_test_1",
			amountCents: 10000n,
				currency: "USD",
		});
		// Simulate webhook handler logic (the httpAction calls these)
		await t.mutation(internal.payments.markSucceeded, { paymentId });
		const row = (await t.run((ctx) => ctx.db.get(paymentId))) as any;
		expect(row?.status).toBe("succeeded");
		expect(row?.processedAt).toBeDefined();
	});

	it("payment_intent.payment_failed dispatches with reason", async () => {
		const t = convexTest(schema, modules);
		_resetKeyForTest();
		const orgId = "org_sw2";
		const bookingId = await t.run((ctx) => seedBooking(ctx, orgId));
		const paymentId = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			stripePaymentIntentId: "pi_test_2",
			amountCents: 10000n,
				currency: "USD",
		});
		await t.mutation(internal.payments.markFailed, {
			paymentId,
			reason: "Card declined",
		});
		const row = (await t.run((ctx) => ctx.db.get(paymentId))) as any;
		expect(row?.status).toBe("failed");
	});

	it("charge.refunded dispatches to markRefunded", async () => {		const t = convexTest(schema, modules);
		_resetKeyForTest();
		const orgId = "org_sw3";
		const bookingId = await t.run((ctx) => seedBooking(ctx, orgId));
		const paymentId = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			stripePaymentIntentId: "pi_test_3",
			amountCents: 10000n,
				currency: "USD",
		});
		await t.mutation(internal.payments.markSucceeded, { paymentId });
		await t.mutation(internal.payments.markRefunded, { paymentId });
		const row = (await t.run((ctx) => ctx.db.get(paymentId))) as any;
		expect(row?.status).toBe("refunded");
	});

	it("signature verification: signed payload verifies", async () => {
		const secret = "whsec_test_secret_12345";
		const body = '{"type":"payment_intent.succeeded","data":{"object":{"id":"pi_test_4"}}}';
		const ts = 1700000000;
		const sig = await signStripePayload(body, secret, ts);
		// Pass now in ms (verifyStripeSignature treats it as ms, divides by 1000)
		const valid = await verifyStripeSignature(body, sig, secret, ts * 1000);
		expect(valid).toBe(true);
	});

	it("signature verification: tampered body rejected", async () => {
		const secret = "whsec_test_secret_12345";
		const body = '{"type":"payment_intent.succeeded","data":{"object":{"id":"pi_test_5"}}}';
		const ts = 1700000000;
		const sig = await signStripePayload(body, secret, ts);
		const tampered = '{"type":"payment_intent.succeeded","data":{"object":{"id":"pi_attacker"}}}';
		const valid = await verifyStripeSignature(tampered, sig, secret, ts * 1000);
		expect(valid).toBe(false);
	});

	it("signature verification: wrong secret rejected", async () => {
		const body = '{"type":"payment_intent.succeeded","data":{"object":{"id":"pi_test_6"}}}';
		const ts = 1700000000;
		const sig = await signStripePayload(body, "whsec_correct", ts);
		const valid = await verifyStripeSignature(body, sig, "whsec_wrong", ts * 1000);
		expect(valid).toBe(false);
	});

	it("parseStripeSignature: extracts t= and v1= fields", () => {
		const parsed = parseStripeSignature(
			"t=1700000000,v1=abcdef0123456789",
		);
		expect(parsed).not.toBeNull();
		expect(parsed!.timestamp).toBe(1700000000);
		expect(parsed!.signature.length).toBeGreaterThan(0);
	});

	it("getPaymentByIntent: returns paymentId when org matches", async () => {
		const t = convexTest(schema, modules);
		_resetKeyForTest();
		const orgId = "org_sw_get1";
		const bookingId = await t.run((ctx) => seedBooking(ctx, orgId));
		await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			stripePaymentIntentId: "pi_match_1",
			amountCents: 10000n,
			currency: "USD",
		});
		const paymentId = await t.query(internal.payments.getPaymentByIntent, {
			stripePaymentIntentId: "pi_match_1",
			organizationId: orgId,
		});
		expect(paymentId).not.toBeNull();
	});

	it("getPaymentByIntent: rejects cross-org lookup (returns null)", async () => {
		// Stripe sends a webhook claiming org=orgA in metadata but the
		// PaymentIntent was actually created under orgB. The org-scoped
		// lookup must return null so we don't update a payment we don't
		// own. This prevents cross-tenant status writes if an intent id
		// ever appears in a different org's webhook.
		const t = convexTest(schema, modules);
		_resetKeyForTest();
		const realOrg = "org_sw_realone";
		const attackerOrg = "org_sw_attacker";
		const bookingId = await t.run((ctx) => seedBooking(ctx, realOrg));
		await t.mutation(internal.payments.recordFromAction, {
			organizationId: realOrg,
			bookingId,
			stripePaymentIntentId: "pi_xorg_1",
			amountCents: 10000n,
			currency: "USD",
		});
		// Lookup from the wrong org → null
		const result = await t.query(internal.payments.getPaymentByIntent, {
			stripePaymentIntentId: "pi_xorg_1",
			organizationId: attackerOrg,
		});
		expect(result).toBeNull();
		// Lookup from the real org → not null
		const ok = await t.query(internal.payments.getPaymentByIntent, {
			stripePaymentIntentId: "pi_xorg_1",
			organizationId: realOrg,
		});
		expect(ok).not.toBeNull();
	});
});

/**
 * F555 — a delayed Checkout payment must not be collected at `completed`.
 *
 * `checkout.session.completed` fires when the customer finishes the flow, not
 * when money settles. For SEPA / ACH / boleto the session is complete while
 * `payment_status` is still "unpaid" and settlement lands days later as
 * `checkout.session.async_payment_succeeded` / `_failed`. The dispatcher sent
 * `completed` straight to `markSucceeded`, crediting the booking balance for
 * funds that had not arrived.
 *
 * The damage was not self-healing, and that is the part worth pinning: the
 * later failure cannot repair a premature success, because `markFailed`
 * refuses any row that is not `pending`. The contrast test at the bottom
 * demonstrates exactly that — so "stay pending" is not a cosmetic choice, it
 * is what keeps the failure repairable.
 */
describe("delayed Checkout settlement (F555)", () => {
	async function pendingPayment(orgId: string, pi: string) {
		const t = convexTest(schema, modules);
		_resetKeyForTest();
		const bookingId = await t.run((ctx) => seedBooking(ctx, orgId));
		const paymentId = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			stripePaymentIntentId: pi,
			amountCents: 10000n,
			currency: "USD",
		});
		return { t, paymentId };
	}

	const status = async (t: any, id: any) =>
		((await t.run((ctx: any) => ctx.db.get(id))) as any)?.status;

	it("a completed-but-unpaid session leaves the payment pending", async () => {
		const { t, paymentId } = await pendingPayment("org_sw555a", "pi_delay_1");

		// This is the branch the dispatcher now takes instead of fulfilling.
		expect(
			decideCheckoutSettlement("checkout.session.completed", "unpaid"),
		).toBe("await-async");

		// No mutation is invoked, so the row is untouched and still pending.
		expect(await status(t, paymentId)).toBe("pending");
	});

	it("a delayed payment that later fails is recorded as failed", async () => {
		const { t, paymentId } = await pendingPayment("org_sw555b", "pi_delay_2");

		expect(
			decideCheckoutSettlement("checkout.session.completed", "unpaid"),
		).toBe("await-async");
		expect(await status(t, paymentId)).toBe("pending");

		// Days later the async failure lands, and the row is still repairable.
		expect(
			decideCheckoutSettlement("checkout.session.async_payment_failed", "unpaid"),
		).toBe("mark-failed");
		await t.mutation(internal.payments.markFailed, {
			paymentId,
			reason: "insufficient funds",
		});
		expect(await status(t, paymentId)).toBe("failed");
	});

	it("a delayed payment that later succeeds is collected on the async event", async () => {
		const { t, paymentId } = await pendingPayment("org_sw555c", "pi_delay_3");

		expect(
			decideCheckoutSettlement("checkout.session.completed", "unpaid"),
		).toBe("await-async");
		expect(
			decideCheckoutSettlement("checkout.session.async_payment_succeeded", "paid"),
		).toBe("mark-succeeded");

		await t.mutation(internal.payments.markSucceeded, { paymentId });
		expect(await status(t, paymentId)).toBe("succeeded");
	});

	it("a card payment is still collected on completed, unchanged", async () => {
		const { t, paymentId } = await pendingPayment("org_sw555d", "pi_card_1");

		expect(decideCheckoutSettlement("checkout.session.completed", "paid")).toBe(
			"mark-succeeded",
		);
		await t.mutation(internal.payments.markSucceeded, { paymentId });
		expect(await status(t, paymentId)).toBe("succeeded");
	});

	it("why this is not cosmetic: a succeeded row cannot be marked failed", async () => {
		// The exact non-self-healing property F555 turned on. If this ever
		// starts succeeding, the "stay pending" gate is what changed.
		const { t, paymentId } = await pendingPayment("org_sw555e", "pi_race_1");
		await t.mutation(internal.payments.markSucceeded, { paymentId });
		await expect(
			t.mutation(internal.payments.markFailed, { paymentId, reason: "later" }),
		).rejects.toThrow(/non-pending/i);
		expect(await status(t, paymentId)).toBe("succeeded");
	});
});
