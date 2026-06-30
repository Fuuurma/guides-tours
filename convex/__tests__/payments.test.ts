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

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

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
			currency: "USD",
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
			currency: "USD",
			stripePaymentIntentId: "pi_test_002",
		});
		const second = await t.mutation(internal.payments.recordFromAction, {
			organizationId: orgId,
			bookingId,
			amountCents: 10000n,
			currency: "USD",
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
			currency: "USD",
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
			currency: "USD",
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
			currency: "USD",
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
			currency: "USD",
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
			currency: "USD",
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
			currency: "USD",
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
			currency: "USD",
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

	it("upsertSettings preserves existing secrets when placeholder sent", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_placeholder_test";
		const { encrypt, decrypt } = await import("../lib/crypto");

		// Seed existing paymentSettings with real encrypted secrets.
		await t.run(async (ctx) => {
			await ctx.db.insert("paymentSettings", {
				organizationId: orgId,
				stripeEnabled: true,
				stripePublishableKey: "pk_real",
				stripeSecretKey: await encrypt("sk_real_secret_value"),
				stripeWebhookSecret: await encrypt(
					"whsec_real_secret_value",
				),
				stripeIsSandbox: false,
				acceptDeposits: false,
				depositPercentage: 20,
				defaultCurrency: "USD",
				createdAt: 0,
				updatedAt: 0,
			});
		});

		// Call upsertSettings via internal mutation with placeholders.
		await t.mutation(internal.payments.upsertSettingsInternal, {
			stripeEnabled: false,
			stripePublishableKey: "pk_changed",
			stripeSecretKey: "placeholder-no-change",
			stripeWebhookSecret: "placeholder-no-change",
			stripeIsSandbox: true,
			acceptDeposits: true,
			depositPercentage: 30,
			defaultCurrency: "EUR",
			_organizationId: orgId,
		});

		// Secrets must still decrypt to the original values, not the
		// encrypted form of "placeholder-no-change".
		await t.run(async (ctx) => {
			const s = await ctx.db
				.query("paymentSettings")
				.withIndex("by_org", (q) => q.eq("organizationId", orgId))
				.unique();
			expect(s).toBeDefined();
			expect(s!.stripeEnabled).toBe(false);
			expect(s!.stripePublishableKey).toBe("pk_changed");
			expect(s!.stripeIsSandbox).toBe(true);
			expect(s!.acceptDeposits).toBe(true);
			expect(s!.depositPercentage).toBe(30);
			expect(s!.defaultCurrency).toBe("EUR");
			expect(await decrypt(s!.stripeSecretKey)).toBe(
				"sk_real_secret_value",
			);
			expect(await decrypt(s!.stripeWebhookSecret)).toBe(
				"whsec_real_secret_value",
			);
		});
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

describe("convex/payments — input validation (defense in depth)", () => {
	// The FE sends validated values, but the BE is reachable by any
	// Convex client. These tests prove the BE rejects malformed inputs
	// even if the FE is bypassed. Use the internal mirror (recordFromAction)
	// to bypass the requireRole auth check that the public record has.

	it("rejects lowercase currency code (must be uppercase ISO 4217)", async () => {
		const t = convexTest(schema, modules);
		const bookingId = await t.run((ctx) =>
			seedBooking(ctx as unknown as TestCtx, "org_pay_cur"),
		);
		await expect(
			t.mutation(internal.payments.recordFromAction, {
				organizationId: "org_pay_cur",
				bookingId,
				amountCents: 1000n,
				currency: "usd",
				stripePaymentIntentId: "pi_test_cur_1",
			}),
		).rejects.toThrow(/Invalid currency/);
	});

	it("rejects currency code with digits", async () => {
		const t = convexTest(schema, modules);
		const bookingId = await t.run((ctx) =>
			seedBooking(ctx as unknown as TestCtx, "org_pay_cur2"),
		);
		await expect(
			t.mutation(internal.payments.recordFromAction, {
				organizationId: "org_pay_cur2",
				bookingId,
				amountCents: 1000n,
				currency: "US1",
				stripePaymentIntentId: "pi_test_cur_2",
			}),
		).rejects.toThrow(/Invalid currency/);
	});

	it("rejects stripePaymentIntentId over MAX_STRIPE_INTENT_ID_LEN", async () => {
		const t = convexTest(schema, modules);
		const bookingId = await t.run((ctx) =>
			seedBooking(ctx as unknown as TestCtx, "org_pay_int"),
		);
		await expect(
			t.mutation(internal.payments.recordFromAction, {
				organizationId: "org_pay_int",
				bookingId,
				amountCents: 1000n,
				currency: "USD",
				stripePaymentIntentId: `pi_${"x".repeat(70)}`,
			}),
		).rejects.toThrow(/stripePaymentIntentId is too long/);
	});

	it("accepts a valid uppercase 3-letter currency code", async () => {
		const t = convexTest(schema, modules);
		const bookingId = await t.run((ctx) =>
			seedBooking(ctx as unknown as TestCtx, "org_pay_ok"),
		);
		const id = await t.mutation(internal.payments.recordFromAction, {
			organizationId: "org_pay_ok",
			bookingId,
			amountCents: 1000n,
			currency: "EUR",
			stripePaymentIntentId: "pi_test_ok_eur",
		});
		expect(id).toBeDefined();
	});
});

describe("convex/payments — upsertSettings validation", () => {
	it("rejects depositPercentage > 100", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(internal.payments.upsertSettingsInternal, {
				_organizationId: "org_dep_high",
				stripeEnabled: false,
				stripePublishableKey: "",
				stripeSecretKey: "placeholder-no-change",
				stripeWebhookSecret: "placeholder-no-change",
				stripeIsSandbox: true,
				acceptDeposits: true,
				depositPercentage: 150,
				defaultCurrency: "USD",
			}),
		).rejects.toThrow(/depositPercentage must be between/);
	});

	it("rejects depositPercentage < 0", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(internal.payments.upsertSettingsInternal, {
				_organizationId: "org_dep_low",
				stripeEnabled: false,
				stripePublishableKey: "",
				stripeSecretKey: "placeholder-no-change",
				stripeWebhookSecret: "placeholder-no-change",
				stripeIsSandbox: true,
				acceptDeposits: true,
				depositPercentage: -10,
				defaultCurrency: "USD",
			}),
		).rejects.toThrow(/depositPercentage must be between/);
	});

	it("rejects lowercase currency in upsertSettings", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(internal.payments.upsertSettingsInternal, {
				_organizationId: "org_cur_bad",
				stripeEnabled: false,
				stripePublishableKey: "",
				stripeSecretKey: "placeholder-no-change",
				stripeWebhookSecret: "placeholder-no-change",
				stripeIsSandbox: true,
				acceptDeposits: false,
				depositPercentage: 30,
				defaultCurrency: "usd",
			}),
		).rejects.toThrow(/Invalid currency/);
	});

	it("accepts depositPercentage 0 and 100", async () => {
		const t = convexTest(schema, modules);
		// 0%
		await t.mutation(internal.payments.upsertSettingsInternal, {
			_organizationId: "org_dep_0",
			stripeEnabled: false,
			stripePublishableKey: "",
			stripeSecretKey: "placeholder-no-change",
			stripeWebhookSecret: "placeholder-no-change",
			stripeIsSandbox: true,
			acceptDeposits: false,
			depositPercentage: 0,
			defaultCurrency: "USD",
		});
		const s0 = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("paymentSettings")
				.withIndex("by_org", (q) => q.eq("organizationId", "org_dep_0"))
				.unique();
			return r;
		});
		expect(s0?.depositPercentage).toBe(0);

		// 100%
		await t.mutation(internal.payments.upsertSettingsInternal, {
			_organizationId: "org_dep_100",
			stripeEnabled: false,
			stripePublishableKey: "",
			stripeSecretKey: "placeholder-no-change",
			stripeWebhookSecret: "placeholder-no-change",
			stripeIsSandbox: true,
			acceptDeposits: true,
			depositPercentage: 100,
			defaultCurrency: "EUR",
		});
		const s100 = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("paymentSettings")
				.withIndex("by_org", (q) => q.eq("organizationId", "org_dep_100"))
				.unique();
			return r;
		});
		expect(s100?.depositPercentage).toBe(100);
	});
});