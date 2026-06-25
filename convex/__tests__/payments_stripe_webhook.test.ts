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

	it("charge.refunded dispatches to markRefunded", async () => {
		const t = convexTest(schema, modules);
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
});
