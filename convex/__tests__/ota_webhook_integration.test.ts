// OTA webhook integration tests.
//
// Exercises the upsert path end-to-end: normalize a payload with one
// of the 7 provider clients, then call ota.upsert.upsertOtaBooking
// and assert the row written to otaBookings. Verifies idempotency
// (re-running the same reservationId updates rather than duplicates)
// and cancel flow (cancelOtaBooking flips status).

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";
import { ViatorClient } from "../ota/viator";
import { GetYourGuideClient } from "../ota/getyourguide";
import { BookingClient } from "../ota/booking";

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

async function upsertViaViator(
	t: ReturnType<typeof convexTest>,
	orgId: string,
	integrationId: any,
	reservationId: string,
) {
	const raw = {
		eventType: "BOOKING_CREATED",
		reservation: {
			id: reservationId,
			productCode: "P-100",
			customer: { name: "Alice", email: "a@a.com" },
			guests: 2,
			startDateTime: "2026-09-01T09:00:00Z",
			tour: { date: "2026-09-01" },
			totalPaid: 100,
			currency: "USD",
			commissionAmount: 20,
		},
	};
	const normalized = ViatorClient.normalize(raw) as any;
	await t.mutation(internal.ota.upsert.upsertOtaBooking, {
		integrationId,
		organizationId: orgId,
		provider: "viator",
		event: {
			kind: "booking.created",
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

describe("OTA webhook upsert — Viator", () => {
	test("creates an otaBookings row from a normalized payload", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_vi1";
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId, "viator"),
		);
		await upsertViaViator(t, orgId, integrationId, "VR-001");

		const rows = (await t.run((ctx) =>
			ctx.db.query("otaBookings").collect(),
		)) as any;
		expect(rows.length).toBe(1);
		expect(rows[0].otaReservationId).toBe("VR-001");
		expect(rows[0].otaCustomerEmail).toBe("a@a.com");
		expect(rows[0].otaGuests).toBe(2);
		expect(String(rows[0].otaTotalPaidCents)).toBe("10000");
		expect(rows[0].status).toBe("confirmed");
	});

	test("re-running with same reservationId is idempotent", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_vi2";
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId, "viator"),
		);
		await upsertViaViator(t, orgId, integrationId, "VR-002");
		await upsertViaViator(t, orgId, integrationId, "VR-002");
		const rows = (await t.run((ctx) =>
			ctx.db.query("otaBookings").collect(),
		)) as any;
		expect(rows.length).toBe(1);
	});

	test("cancel flips status to cancelled", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_vi3";
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId, "viator"),
		);
		await upsertViaViator(t, orgId, integrationId, "VR-003");
		await t.mutation(internal.ota.upsert.cancelOtaBooking, {
			integrationId,
			reservationId: "VR-003",
			rawData: {},
		});
		const row = (await t.run((ctx) =>
			ctx.db
				.query("otaBookings")
				.withIndex("by_integration_reservation", (q) =>
					q
						.eq("integrationId", integrationId)
						.eq("otaReservationId", "VR-003"),
				)
				.unique(),
		)) as any;
		expect(row?.status).toBe("cancelled");
	});
});

describe("OTA webhook upsert — GetYourGuide", () => {
	test("normalizes booking_created and upserts", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_gyg1";
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId, "getyourguide"),
		);
		const raw = {
			type: "booking_created",
			data: {
				bookingId: "GYG-001",
				activityId: "A-100",
				traveler: { name: "Bob", email: "b@b.com" },
				participants: 3,
				tourDate: "2026-10-01",
				tourTime: "14:00",
				totalAmount: "75.00",
				currency: "EUR",
			},
		};
		const n = GetYourGuideClient.normalize(raw) as any;
		await t.mutation(internal.ota.upsert.upsertOtaBooking, {
			integrationId,
			organizationId: orgId,
			provider: "getyourguide",
			event: {
				kind: "booking.created",
				reservationId: n.reservationId,
				productId: n.productId,
				customerName: n.customerName,
				customerEmail: n.customerEmail,
				customerPhone: n.customerPhone,
				customerCountry: n.customerCountry,
				tourDate: n.tourDate,
				tourTime: n.tourTime,
				guests: n.guests,
				totalPaidCents: BigInt(n.totalPaidCents ?? 0),
				currency: n.currency,
				commissionRate: n.commissionRate,
				commissionCents: BigInt(n.commissionCents ?? 0),
				rawPayload: raw,
			},
			rawData: raw,
		});
		const rows = (await t.run((ctx) =>
			ctx.db.query("otaBookings").collect(),
		)) as any;
		expect(rows.length).toBe(1);
		expect(rows[0].otaReservationId).toBe("GYG-001");
		expect(rows[0].otaCurrency).toBe("EUR");
		expect(rows[0].otaGuests).toBe(3);
	});
});

describe("OTA webhook upsert — Booking.com", () => {
	test("normalizes RESERVATION_CREATED and upserts", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_bk1";
		const integrationId = await t.run((ctx) =>
			seedIntegration(ctx, orgId, "booking"),
		);
		const raw = {
			eventType: "RESERVATION_CREATED",
			data: {
				id: "BK-001",
				productId: "H-1",
				guest: { name: "Carol", email: "c@c.com" },
				guestCount: 2,
				startDate: "2026-11-01",
				totalAmount: 200,
				currency: "USD",
			},
		};
		const n = BookingClient.normalize(raw) as any;
		await t.mutation(internal.ota.upsert.upsertOtaBooking, {
			integrationId,
			organizationId: orgId,
			provider: "booking",
			event: {
				kind: "booking.created",
				reservationId: n.reservationId,
				productId: n.productId,
				customerName: n.customerName,
				customerEmail: n.customerEmail,
				customerPhone: n.customerPhone,
				customerCountry: n.customerCountry,
				tourDate: n.tourDate,
				tourTime: n.tourTime,
				guests: n.guests,
				totalPaidCents: BigInt(n.totalPaidCents ?? 0),
				currency: n.currency,
				commissionRate: n.commissionRate,
				commissionCents: BigInt(n.commissionCents ?? 0),
				rawPayload: raw,
			},
			rawData: raw,
		});
		const rows = (await t.run((ctx) =>
			ctx.db.query("otaBookings").collect(),
		)) as any;
		expect(rows.length).toBe(1);
		expect(rows[0].otaReservationId).toBe("BK-001");
		// Booking.com sends amount in dollars — converted to cents (200 → 20000)
		expect(String(rows[0].otaTotalPaidCents)).toBe("20000");
	});
});
