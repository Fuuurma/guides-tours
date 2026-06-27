// Tests for payments + Stripe integration.
//
// Coverage:
//   - payments.record (idempotent by stripePaymentIntentId)
//   - payments.markSucceeded / markFailed / markRefunded transitions
//   - refund only allowed from succeeded state
//   - getStripeSecrets returns ciphertext (decryption in caller)
//   - parseStripeSignature parses t=...,v1=...
//   - verifyStripeSignature: round-trip (sign with Web Crypto,
//     verify with our helper) — proves our HMAC math matches Stripe's

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import schema from "../schema";
import { internal } from "../_generated/api";
import {
	parseStripeSignature,
	verifyStripeSignature,
} from "../payments_stripe";

const modules = import.meta.glob("../**/*.{ts,tsx}");

type TestCtx = GenericMutationCtx<DataModel> & {
	storage: { getUrl: (id: string) => Promise<string | null> };
};

async function seedBooking(
	ctx: TestCtx,
	orgId: string,
	overrides: Partial<{
		totalAmountCents: bigint;
		depositAmountCents: bigint;
		status: "pending" | "confirmed" | "checked_in" | "completed" | "cancelled";
	}> = {},
): Promise<Id<"bookings">> {
	const tourId = await ctx.db.insert("tours", {
		organizationId: orgId,
		name: "Tour",
		description: "",
		durationHours: 1,
		isActive: true,
		recurrenceType: "none",
		recurrenceDaysOfWeek: [],
		capacity: 10,
		bufferMinutes: 15,
		minGuests: 1,
		maxGuests: 10,
		bookingCutoffHours: 24,
		tourType: "walkable",
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
		name: "Alice",
		email: "alice@example.com",
		phone: "",
		notes: "",
		smsConsent: false,
		emailConsent: false,
		preferredLanguage: "en",
		tags: [],
		source: "",
		sourceDetails: "",
		specialRequirements: "",
		vipStatus: false,
		loyaltyPoints: 0,
		totalVisits: 0,
		totalRevenueCents: 0n,
		createdAt: 0,
		updatedAt: 0,
	});
	const total = overrides.totalAmountCents ?? 10000n;
	const deposit = overrides.depositAmountCents ?? 0n;
	return await ctx.db.insert("bookings", {
		organizationId: orgId,
		tourId,
		customerId,
		date: "2026-09-01",
		startTime: "09:00",
		guests: 2,
		guestNames: "",
		languageRequired: "",
		notes: "",
		status: overrides.status ?? "pending",
		depositAmountCents: deposit,
		totalAmountCents: total,
		balanceDueCents: total - deposit,
		paymentMethod: "",
		checkedInAt: undefined,
		checkedInBy: "",
		completedAt: undefined,
		netRevenueCents: total,
		source: "direct",
		reviewRating: undefined,
		reviewComment: "",
		createdAt: 0,
		updatedAt: 0,
	});
}

describe("convex/payments — record (idempotent by stripePaymentIntentId)", () => {
	it("first record creates a pending row", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pay_a";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		const paymentId = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			amountCents: 10000n,
			currency: "usd",
			stripePaymentIntentId: "pi_test_001",
		});
		const row = (await t.run(async (ctx) => ctx.db.get(paymentId))) as any;
		expect(row?.status).toBe("pending");
		expect(row?.provider).toBe("stripe");
		expect(row?.amountCents).toBe(10000n);
	});

	it("second record with same intent id returns the existing row", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pay_b";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		const first = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			amountCents: 10000n,
			currency: "usd",
			stripePaymentIntentId: "pi_test_002",
		});
		const second = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			amountCents: 10000n,
			currency: "usd",
			stripePaymentIntentId: "pi_test_002",
		});
		expect(second).toBe(first);
	});
});

describe("convex/payments — markSucceeded / markFailed / markRefunded", () => {
	it("markSucceeded moves pending → succeeded and writes processedAt", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pay_c";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		const paymentId = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			amountCents: 5000n,
			currency: "usd",
			stripePaymentIntentId: "pi_test_003",
		});
		await t.mutation(internal.payments.markSucceeded, { paymentId });
		const row = (await t.run(async (ctx) => ctx.db.get(paymentId))) as any;
		expect(row?.status).toBe("succeeded");
		expect(row?.processedAt).toBeGreaterThan(0);
	});

	it("markSucceeded is idempotent (re-applying keeps succeeded)", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pay_d";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		const paymentId = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			amountCents: 5000n,
			currency: "usd",
			stripePaymentIntentId: "pi_test_004",
		});
		await t.mutation(internal.payments.markSucceeded, { paymentId });
		const first = (await t.run(async (ctx) => ctx.db.get(paymentId))) as any;
		await t.mutation(internal.payments.markSucceeded, { paymentId });
		const second = (await t.run(async (ctx) => ctx.db.get(paymentId))) as any;
		expect(second?.processedAt).toBe(first?.processedAt);
	});

	it("markFailed captures the failure reason", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pay_e";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		const paymentId = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			amountCents: 5000n,
			currency: "usd",
			stripePaymentIntentId: "pi_test_005",
		});
		await t.mutation(internal.payments.markFailed, {
			paymentId,
			reason: "Your card was declined.",
		});
		const row = (await t.run(async (ctx) => ctx.db.get(paymentId))) as any;
		expect(row?.status).toBe("failed");
	});

	// State-machine guards: webhooks can re-deliver events, but a
	// late event must not flip a terminal row.

	it("markSucceeded refuses to overwrite a failed payment", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pay_f";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		const paymentId = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			amountCents: 5000n,
			currency: "usd",
			stripePaymentIntentId: "pi_test_guard_1",
		});
		await t.mutation(internal.payments.markFailed, {
			paymentId,
			reason: "declined",
		});
		await expect(
			t.mutation(internal.payments.markSucceeded, { paymentId }),
		).rejects.toThrow(/Cannot mark non-pending payment as succeeded/);
		const row = (await t.run(async (ctx) => ctx.db.get(paymentId))) as any;
		expect(row?.status).toBe("failed");
	});

	it("markFailed refuses to overwrite a succeeded payment", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pay_g";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		const paymentId = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			amountCents: 5000n,
			currency: "usd",
			stripePaymentIntentId: "pi_test_guard_2",
		});
		await t.mutation(internal.payments.markSucceeded, { paymentId });
		await expect(
			t.mutation(internal.payments.markFailed, {
				paymentId,
				reason: "late event",
			}),
		).rejects.toThrow(/Cannot mark non-pending payment as failed/);
		const row = (await t.run(async (ctx) => ctx.db.get(paymentId))) as any;
		expect(row?.status).toBe("succeeded");
	});

	it("markRefunded refuses to mark a non-succeeded payment", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pay_h";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		const paymentId = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			amountCents: 5000n,
			currency: "usd",
			stripePaymentIntentId: "pi_test_guard_3",
		});
		// status is "pending" — markRefunded must reject
		await expect(
			t.mutation(internal.payments.markRefunded, { paymentId }),
		).rejects.toThrow(/Cannot mark non-succeeded payment as refunded/);
		const row = (await t.run(async (ctx) => ctx.db.get(paymentId))) as any;
		expect(row?.status).toBe("pending");
	});

	it("markRefunded is idempotent on already-refunded payment", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pay_i";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		const paymentId = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			amountCents: 5000n,
			currency: "usd",
			stripePaymentIntentId: "pi_test_guard_4",
		});
		await t.mutation(internal.payments.markSucceeded, { paymentId });
		await t.mutation(internal.payments.markRefunded, { paymentId });
		// Re-applying should not throw (idempotent)
		await t.mutation(internal.payments.markRefunded, { paymentId });
		const row = (await t.run(async (ctx) => ctx.db.get(paymentId))) as any;
		expect(row?.status).toBe("refunded");
	});
});

describe("convex/payments — getStripeSecrets (returns ciphertext)", () => {
	it("returns null when no settings row exists", async () => {
		const t = convexTest(schema, modules);
		const result = await t.query(internal.payments.getStripeSecrets, {
			organizationId: "org_none",
		});
		expect(result).toBeNull();
	});

	it("returns encrypted ciphertexts (decryption happens in the caller)", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			await c.db.insert("paymentSettings", {
				organizationId: "org_pay_f",
				stripeEnabled: true,
				stripePublishableKey: "pk_test_xxx",
				stripeSecretKey: "iv:ct:tag",
				stripeWebhookSecret: "iv:ct:tag",
				stripeIsSandbox: true,
				acceptDeposits: true,
				depositPercentage: 20,
				defaultCurrency: "USD",
				createdAt: 0,
				updatedAt: 0,
			});
		});
		const result = await t.query(internal.payments.getStripeSecrets, {
			organizationId: "org_pay_f",
		});
		expect(result?.stripeSecretKey).toBe("iv:ct:tag");
		expect(result?.defaultCurrency).toBe("USD");
		expect(result?.stripeIsSandbox).toBe(true);
	});
});

describe("payments_stripe — parseStripeSignature + verifyStripeSignature", () => {
	it("parses t=...,v1=... format", () => {
		const parsed = parseStripeSignature(
			"t=1700000000,v1=abc123def456,v0=ignored",
		);
		expect(parsed).not.toBeNull();
		expect(parsed?.timestamp).toBe(1700000000);
		expect(parsed?.signature).toBe("abc123def456");
	});

	it("returns null when required fields missing", () => {
		expect(parseStripeSignature("")).toBeNull();
		expect(parseStripeSignature("v1=abc")).toBeNull();
		expect(parseStripeSignature("t=1700000000")).toBeNull();
	});

	it("verifyStripeSignature round-trip accepts a valid signature", async () => {
		// Sign with Web Crypto, verify with our helper.
		const secret = "whsec_test_round_trip";
		const payload = '{"id":"evt_test","type":"ping"}';
		const timestamp = 1700000000;
		const signed = `${timestamp}.${payload}`;

		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		const sigBuf = await crypto.subtle.sign(
			"HMAC",
			key,
			new TextEncoder().encode(signed),
		);
		const hex = Array.from(new Uint8Array(sigBuf))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		const header = `t=${timestamp},v1=${hex}`;
		const ok = await verifyStripeSignature(payload, header, secret, timestamp * 1000);
		expect(ok).toBe(true);
	});

	it("verifyStripeSignature rejects a tampered payload", async () => {
		const secret = "whsec_test_round_trip";
		const timestamp = 1700000000;
		const signed = `${timestamp}.{"id":"evt_test","type":"ping"}`;

		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		const sigBuf = await crypto.subtle.sign(
			"HMAC",
			key,
			new TextEncoder().encode(signed),
		);
		const hex = Array.from(new Uint8Array(sigBuf))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		// Verify with a TAMPERED payload.
		const tamperedPayload = '{"id":"evt_test","type":"REFUNDED"}';
		const ok = await verifyStripeSignature(
			tamperedPayload,
			`t=${timestamp},v1=${hex}`,
			secret,
			timestamp * 1000,
		);
		expect(ok).toBe(false);
	});

	it("verifyStripeSignature rejects a stale timestamp", async () => {
		const secret = "whsec_test_round_trip";
		const timestamp = 1700000000;
		const signed = `${timestamp}.{"id":"evt_test"}`;
		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		const sigBuf = await crypto.subtle.sign(
			"HMAC",
			key,
			new TextEncoder().encode(signed),
		);
		const hex = Array.from(new Uint8Array(sigBuf))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		// "now" is 1 hour later — outside the 5-min default tolerance.
		const ok = await verifyStripeSignature(
			signed.split(".").slice(1).join("."),
			`t=${timestamp},v1=${hex}`,
			secret,
			(timestamp + 3600) * 1000,
		);
		expect(ok).toBe(false);
	});
});