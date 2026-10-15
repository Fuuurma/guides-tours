// Stripe webhook tests, driven through the real HTTP route.
//
// Every event is signed with the org's stored webhook secret and POSTed to
// /api/payments/stripe/webhook via convex-test's t.fetch, so signature
// verification, org resolution, event claiming and the dispatcher's own
// branching all run. (Earlier versions called the internal mutations
// directly and asserted the decision table beside them, which left the
// dispatcher itself unexecuted — a neutered F555 branch stayed green.)

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";
import { signStripePayload } from "../payments_stripe";
import {
	CHECKOUT_SESSION_ASYNC_FAILED,
	CHECKOUT_SESSION_ASYNC_SUCCEEDED,
} from "../lib/checkoutSettlement";
import { _resetKeyForTest, encrypt } from "../lib/crypto";

const modules = import.meta.glob("../**/*.{ts,tsx}");

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

const WEBHOOK_PATH = "/api/payments/stripe/webhook";
const WHSEC = "whsec_test_route_secret";

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

/** An org with Stripe configured and one pending payment for `pi`. */
async function orgWithPendingPayment(orgId: string, pi: string) {
	const t = convexTest(schema, modules);
	_resetKeyForTest();
	const bookingId = await t.run(async (ctx) => {
		await ctx.db.insert("paymentSettings", {
			organizationId: orgId,
			stripeEnabled: true,
			stripePublishableKey: "pk_test",
			stripeSecretKey: await encrypt("sk_test"),
			stripeWebhookSecret: await encrypt(WHSEC),
			stripeIsSandbox: true,
			acceptDeposits: false,
			depositPercentage: 20,
			defaultCurrency: "USD",
			createdAt: 0,
			updatedAt: 0,
		});
		return await seedBooking(ctx, orgId);
	});
	const paymentId = await t.mutation(internal.payments.recordFromAction, {
		organizationId: orgId,
		bookingId,
		stripePaymentIntentId: pi,
		amountCents: 10000n,
		currency: "USD",
	});
	const status = async () =>
		((await t.run((ctx) => ctx.db.get(paymentId))) as { status: string } | null)
			?.status;
	return { t, status };
}

let eventSeq = 0;

async function deliver(
	t: ReturnType<typeof convexTest>,
	type: string,
	object: Record<string, unknown>,
	secret = WHSEC,
) {
	const body = JSON.stringify({
		id: `evt_route_${++eventSeq}`,
		type,
		data: { object },
	});
	return await t.fetch(WEBHOOK_PATH, {
		method: "POST",
		body,
		headers: {
			"content-type": "application/json",
			"stripe-signature": await signStripePayload(body, secret),
		},
	});
}

describe("stripe webhook route — dispatch", () => {
	it("payment_intent.succeeded marks the org's pending payment succeeded", async () => {
		const { t, status } = await orgWithPendingPayment("org_sw1", "pi_route_1");
		const res = await deliver(t, "payment_intent.succeeded", {
			id: "pi_route_1",
			metadata: { organizationId: "org_sw1" },
		});
		expect(res.status).toBe(200);
		expect(await status()).toBe("succeeded");
	});

	it("payment_intent.payment_failed marks it failed", async () => {
		const { t, status } = await orgWithPendingPayment("org_sw2", "pi_route_2");
		const res = await deliver(t, "payment_intent.payment_failed", {
			id: "pi_route_2",
			metadata: { organizationId: "org_sw2" },
			last_payment_error: { message: "Card declined" },
		});
		expect(res.status).toBe(200);
		expect(await status()).toBe("failed");
	});

	it("a body signed with another secret is refused with 401 and changes nothing", async () => {
		const { t, status } = await orgWithPendingPayment("org_sw3", "pi_route_3");
		const res = await deliver(
			t,
			"payment_intent.succeeded",
			{ id: "pi_route_3", metadata: { organizationId: "org_sw3" } },
			"whsec_attacker",
		);
		expect(res.status).toBe(401);
		expect(await status()).toBe("pending");
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
 * `checkout.session.async_payment_succeeded` / `_failed`. Collecting at
 * `completed` credited the booking balance for funds that had not arrived,
 * and the later failure could not repair it: `markFailed` refuses any row
 * that is not `pending` (pinned in payments.test.ts).
 */
describe("delayed Checkout settlement through the route (F555)", () => {
	const session = (orgId: string, pi: string, paymentStatus: string) => ({
		id: `cs_${pi}`,
		payment_intent: pi,
		payment_status: paymentStatus,
		metadata: { organizationId: orgId },
	});

	it("a completed-but-unpaid session leaves the payment pending", async () => {
		const { t, status } = await orgWithPendingPayment("org_sw555a", "pi_delay_1");
		const res = await deliver(
			t,
			"checkout.session.completed",
			session("org_sw555a", "pi_delay_1", "unpaid"),
		);
		expect(res.status).toBe(200);
		expect(await status()).toBe("pending");
	});

	it("a delayed payment that later fails is recorded as failed", async () => {
		const { t, status } = await orgWithPendingPayment("org_sw555b", "pi_delay_2");
		await deliver(t, "checkout.session.completed", session("org_sw555b", "pi_delay_2", "unpaid"));
		await deliver(t, CHECKOUT_SESSION_ASYNC_FAILED, session("org_sw555b", "pi_delay_2", "unpaid"));
		expect(await status()).toBe("failed");
	});

	it("a delayed payment that later succeeds is collected on the async event", async () => {
		const { t, status } = await orgWithPendingPayment("org_sw555c", "pi_delay_3");
		await deliver(t, "checkout.session.completed", session("org_sw555c", "pi_delay_3", "unpaid"));
		expect(await status()).toBe("pending");
		await deliver(t, CHECKOUT_SESSION_ASYNC_SUCCEEDED, session("org_sw555c", "pi_delay_3", "paid"));
		expect(await status()).toBe("succeeded");
	});

	it("a card payment is still collected on completed", async () => {
		const { t, status } = await orgWithPendingPayment("org_sw555d", "pi_card_1");
		await deliver(t, "checkout.session.completed", session("org_sw555d", "pi_card_1", "paid"));
		expect(await status()).toBe("succeeded");
	});
});
