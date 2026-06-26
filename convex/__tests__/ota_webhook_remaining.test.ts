// OTA webhook integration tests for the 4 providers that aren't
// covered by ota_webhook_integration.test.ts: Airbnb, Klook,
// Tripadvisor, Expedia. Exercises the upsert path end-to-end:
// normalize a payload with the provider client, then call
// ota.upsert.upsertOtaBooking and assert the row written.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";
import { AirbnbClient } from "../ota/airbnb";
import { KlookClient } from "../ota/klook";
import { TripAdvisorClient } from "../ota/tripadvisor";
import { ExpediaClient } from "../ota/expedia";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function seedIntegration(ctx: any, orgId: string, provider: string) {
	return await ctx.db.insert("otaIntegrations", {
		organizationId: orgId,
		provider,
		apiKey: "encrypted-blob",
		apiSecret: "encrypted-blob",
		webhookSecret: "encrypted-blob",
		partnerId: "",
		isActive: true,
		isSandbox: true,
		autoSyncAvailability: false,
		autoSyncPricing: false,
		syncIntervalMinutes: 60,
		settings: {},
		createdAt: 0,
		updatedAt: 0,
	});
}

async function upsertNormalized(
	t: ReturnType<typeof convexTest>,
	integrationId: any,
	orgId: string,
	provider: string,
	raw: any,
) {
	const normalized = (provider === "airbnb"
		? AirbnbClient.normalize(raw)
		: provider === "klook"
			? KlookClient.normalize(raw)
			: provider === "tripadvisor"
				? TripAdvisorClient.normalize(raw)
				: ExpediaClient.normalize(raw)) as any;
	if (!normalized) throw new Error("normalize returned null");
	await t.mutation(internal.ota.upsert.upsertOtaBooking, {
		integrationId,
		organizationId: orgId,
		provider,
		event: {
			kind: normalized.kind,
			reservationId: normalized.reservationId,
			productId: normalized.productId,
			customerName: normalized.customerName,
			customerEmail: normalized.customerEmail,
			customerPhone: normalized.customerPhone,
			customerCountry: normalized.customerCountry,
			tourDate: normalized.tourDate,
			tourTime: normalized.tourTime,
			guests: normalized.guests,
			totalPaidCents: BigInt(normalized.totalPaidCents ?? 0),
			currency: normalized.currency,
			commissionRate: normalized.commissionRate,
			commissionCents: BigInt(normalized.commissionCents ?? 0),
			rawPayload: raw,
		},
		rawData: raw,
	});
}

describe("OTA webhook upsert — Airbnb", () => {
	test("normalizes reservationConfirmed with guest.first_name + last_name", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ab1";
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId, "airbnb"),
		);
		const raw = {
			event_type: "reservationConfirmed",
			data: {
				reservation_id: "AB-001",
				experience_id: "EXP-100",
				guest: { first_name: "Diana", last_name: "Eve", email: "d@e.com" },
				number_of_guests: 4,
				start_date: "2026-12-01",
				start_time: "10:00",
				total_price: { amount: 25000, currency: "USD" }, // cents
			},
		};
		await upsertNormalized(t, integrationId, orgId, "airbnb", raw);
		const rows = (await t.run((ctx) =>
			ctx.db.query("otaBookings").collect(),
		)) as any;
		expect(rows.length).toBe(1);
		expect(rows[0].otaReservationId).toBe("AB-001");
		expect(rows[0].otaCustomerEmail).toBe("d@e.com");
		expect(rows[0].otaGuests).toBe(4);
		expect(String(rows[0].otaTotalPaidCents)).toBe("25000");
		expect(rows[0].otaCurrency).toBe("USD");
		expect(rows[0].status).toBe("confirmed");
	});

	test("accepts flat totalAmount (dollars) fallback", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ab2";
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId, "airbnb"),
		);
		const raw = {
			event_type: "reservationConfirmed",
			data: {
				reservation_id: "AB-002",
				guest: { first_name: "Eve", email: "e@e.com" },
				number_of_guests: 2,
				start_date: "2026-12-02",
				totalAmount: 89.5, // dollars
				currency: "EUR",
			},
		};
		await upsertNormalized(t, integrationId, orgId, "airbnb", raw);
		const row = (await t.run((ctx) =>
			ctx.db.query("otaBookings").first(),
		)) as any;
		expect(String(row.otaTotalPaidCents)).toBe("8950"); // 89.5 → 8950 cents
		expect(row.otaCurrency).toBe("EUR");
	});
});

describe("OTA webhook upsert — Klook", () => {
	test("normalizes order_created with order_id + quantity", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_kl1";
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId, "klook"),
		);
		const raw = {
			event_type: "order_created",
			data: {
				order_id: "KL-001",
				activity_id: "ACT-50",
				guest_name: "Frank",
				guest_email: "f@f.com",
				guest_phone: "+1234567890",
				guest_country: "US",
				tour_date: "2027-01-15",
				tour_time: "09:00",
				quantity: 5,
				total_price: 300,
				currency: "USD",
			},
		};
		await upsertNormalized(t, integrationId, orgId, "klook", raw);
		const rows = (await t.run((ctx) =>
			ctx.db.query("otaBookings").collect(),
		)) as any;
		expect(rows.length).toBe(1);
		expect(rows[0].otaReservationId).toBe("KL-001");
		expect(rows[0].otaGuests).toBe(5);
		expect(String(rows[0].otaTotalPaidCents)).toBe("30000");
		expect(rows[0].otaCustomerName).toBe("Frank");
	});

	test("handles order_cancelled event kind", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_kl2";
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId, "klook"),
		);
		await upsertNormalized(t, integrationId, orgId, "klook", {
			event_type: "order_created",
			data: {
				order_id: "KL-002",
				guest_name: "Gina",
				guest_email: "g@g.com",
				tour_date: "2027-01-16",
				quantity: 1,
				total_price: 50,
				currency: "USD",
			},
		});
		await t.mutation(internal.ota.upsert.cancelOtaBooking, {
			integrationId,
			reservationId: "KL-002",
			rawData: { event_type: "order_cancelled", data: { order_id: "KL-002" } },
		});
		const row = (await t.run((ctx) =>
			ctx.db.query("otaBookings").first(),
		)) as any;
		expect(row.status).toBe("cancelled");
	});
});

describe("OTA webhook upsert — Tripadvisor", () => {
	test("normalizes booking_created with booking_id + guest_count", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ta1";
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId, "tripadvisor"),
		);
		const raw = {
			event_type: "booking_created",
			data: {
				booking_id: "TA-001",
				product_id: "PROD-T1",
				guest_name: "Henry",
				guest_email: "h@h.com",
				tour_date: "2027-02-01",
				tour_time: "11:00",
				guest_count: 3,
				total_amount: 450,
				currency: "USD",
			},
		};
		await upsertNormalized(t, integrationId, orgId, "tripadvisor", raw);
		const rows = (await t.run((ctx) =>
			ctx.db.query("otaBookings").collect(),
		)) as any;
		expect(rows.length).toBe(1);
		expect(rows[0].otaReservationId).toBe("TA-001");
		expect(rows[0].otaGuests).toBe(3);
		expect(String(rows[0].otaTotalPaidCents)).toBe("45000");
		expect(rows[0].otaCustomerName).toBe("Henry");
	});

	test("reservation_cancelled flips status to cancelled", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ta2";
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId, "tripadvisor"),
		);
		await upsertNormalized(t, integrationId, orgId, "tripadvisor", {
			event_type: "booking_created",
			data: {
				booking_id: "TA-002",
				guest_name: "Iris",
				guest_email: "i@i.com",
				tour_date: "2027-02-02",
				guest_count: 2,
				total_amount: 200,
				currency: "USD",
			},
		});
		await t.mutation(internal.ota.upsert.cancelOtaBooking, {
			integrationId,
			reservationId: "TA-002",
			rawData: { event_type: "reservation_cancelled", data: { booking_id: "TA-002" } },
		});
		const row = (await t.run((ctx) =>
			ctx.db.query("otaBookings").first(),
		)) as any;
		expect(row.status).toBe("cancelled");
	});
});

describe("OTA webhook upsert — Expedia", () => {
	test("normalizes ITINERARY_CREATED with traveler name + traveler_count", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ex1";
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId, "expedia"),
		);
		const raw = {
			eventType: "ITINERARY_CREATED",
			data: {
				id: "EX-001",
				activityId: "ACT-EX",
				traveler: { name: "Jane", email: "j@j.com", country: "US" },
				startDate: "2027-03-01",
				startTime: "08:30",
				travelerCount: 6,
				totalPrice: 720,
				currency: "USD",
			},
		};
		await upsertNormalized(t, integrationId, orgId, "expedia", raw);
		const rows = (await t.run((ctx) =>
			ctx.db.query("otaBookings").collect(),
		)) as any;
		expect(rows.length).toBe(1);
		expect(rows[0].otaReservationId).toBe("EX-001");
		expect(rows[0].otaCustomerName).toBe("Jane");
		expect(rows[0].otaGuests).toBe(6);
		expect(String(rows[0].otaTotalPaidCents)).toBe("72000");
	});

	test("ITINERARY_CANCELLED marks row cancelled", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ex2";
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId, "expedia"),
		);
		await upsertNormalized(t, integrationId, orgId, "expedia", {
			eventType: "ITINERARY_CREATED",
			data: {
				id: "EX-002",
				activityId: "ACT-EX",
				traveler: { name: "Karl", email: "k@k.com" },
				startDate: "2027-03-02",
				travelerCount: 2,
				totalPrice: 100,
				currency: "USD",
			},
		});
		await t.mutation(internal.ota.upsert.cancelOtaBooking, {
			integrationId,
			reservationId: "EX-002",
			rawData: { eventType: "ITINERARY_CANCELLED", data: { id: "EX-002" } },
		});
		const row = (await t.run((ctx) =>
			ctx.db.query("otaBookings").first(),
		)) as any;
		expect(row.status).toBe("cancelled");
	});
});
