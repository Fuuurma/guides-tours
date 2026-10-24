// F702 — OTA capacity changes must rebuild the tourAvailability
// projection in the same mutation. applyOtaCapacity patches
// tourSchedules directly and public_booking reads the projection, so a
// missed rebuild meant the public page sold (or hid) seats after every
// OTA create, cancel, guest-count change and schedule move.
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";
import { ViatorClient } from "../ota/viator";
import { seedSchedule, seedTour } from "./helpers";

const modules = import.meta.glob("../**/*.{ts,tsx}");

const ORG = "org_ota_proj";
const DATE = "2026-09-01";

async function seedIntegration(ctx: any, orgId: string) {
	return await ctx.db.insert("otaIntegrations", {
		organizationId: orgId,
		provider: "viator",
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

async function seedOtaProduct(
	ctx: any,
	orgId: string,
	integrationId: any,
	tourId: any,
) {
	return await ctx.db.insert("otaProducts", {
		organizationId: orgId,
		tourId,
		integrationId,
		otaProductId: "P-100",
		syncStatus: "SYNCED",
		otaPhotos: [],
		otaCurrency: "USD",
		commissionRate: 0.1,
		minAdvanceBookingHours: 0,
		maxAdvanceBookingDays: 365,
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
	opts: { guests: number; startDateTime: string; time?: string },
) {
	const raw = {
		eventType: "BOOKING_CREATED",
		reservation: {
			id: reservationId,
			productCode: "P-100",
			customer: { name: "Alice", email: "a@a.com" },
			guests: opts.guests,
			startDateTime: opts.startDateTime,
			tour: { date: DATE, ...(opts.time ? { time: opts.time } : {}) },
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

async function projectionSlot(
	t: any,
	tourId: any,
	scheduleId: any,
) {
	return await t.run(async (ctx: any) => {
		const doc = await ctx.db
			.query("tourAvailability")
			.withIndex("by_tour_date", (q: any) =>
				q.eq("tourId", tourId).eq("date", DATE),
			)
			.unique();
		return doc?.slots.find((s: any) => s.scheduleId === scheduleId) ?? null;
	});
}

describe("OTA capacity → availability projection (F702)", () => {
	test("creation rebuilds the projected slot", async () => {
		const t = convexTest(schema, modules);
		const orgId = ORG;
		const integrationId = await t.run((ctx) => seedIntegration(ctx, orgId));
		const { tourId, scheduleId } = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId });
			const scheduleId = await seedSchedule(ctx, {
				orgId,
				tourId,
				date: DATE,
				startTime: "09:00",
				endTime: "11:00",
				capacityTotal: 10,
			});
			await seedOtaProduct(ctx, orgId, integrationId, tourId);
			return { tourId, scheduleId };
		});

		await upsertViaViator(t, orgId, integrationId, "VR-F702-1", {
			guests: 2,
			startDateTime: `${DATE}T09:00:00Z`,
		});

		const slot = await projectionSlot(t, tourId, scheduleId);
		expect(slot?.capacityBooked).toBe(2);
		expect(slot?.seatsLeft).toBe(8);
	});

	test("guest-count change updates the projected slot", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ota_proj_2";
		const integrationId = await t.run((ctx) => seedIntegration(ctx, orgId));
		const { tourId, scheduleId } = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId });
			const scheduleId = await seedSchedule(ctx, {
				orgId,
				tourId,
				date: DATE,
				startTime: "09:00",
				endTime: "11:00",
				capacityTotal: 10,
			});
			await seedOtaProduct(ctx, orgId, integrationId, tourId);
			return { tourId, scheduleId };
		});

		await upsertViaViator(t, orgId, integrationId, "VR-F702-2", {
			guests: 2,
			startDateTime: `${DATE}T09:00:00Z`,
		});
		await upsertViaViator(t, orgId, integrationId, "VR-F702-2", {
			guests: 5,
			startDateTime: `${DATE}T09:00:00Z`,
		});

		const slot = await projectionSlot(t, tourId, scheduleId);
		expect(slot?.capacityBooked).toBe(5);
		expect(slot?.seatsLeft).toBe(5);
	});

	test("cancellation releases the projected seats", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ota_proj_3";
		const integrationId = await t.run((ctx) => seedIntegration(ctx, orgId));
		const { tourId, scheduleId } = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId });
			const scheduleId = await seedSchedule(ctx, {
				orgId,
				tourId,
				date: DATE,
				startTime: "09:00",
				endTime: "11:00",
				capacityTotal: 10,
			});
			await seedOtaProduct(ctx, orgId, integrationId, tourId);
			return { tourId, scheduleId };
		});

		await upsertViaViator(t, orgId, integrationId, "VR-F702-3", {
			guests: 3,
			startDateTime: `${DATE}T09:00:00Z`,
		});
		await t.mutation(internal.ota.upsert.cancelOtaBooking, {
			integrationId,
			reservationId: "VR-F702-3",
			rawData: {},
		});

		const slot = await projectionSlot(t, tourId, scheduleId);
		expect(slot?.capacityBooked).toBe(0);
		expect(slot?.seatsLeft).toBe(10);
	});

	test("schedule move moves the projected seats between slots", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ota_proj_4";
		const integrationId = await t.run((ctx) => seedIntegration(ctx, orgId));
		const { tourId, morning, afternoon } = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId });
			const morning = await seedSchedule(ctx, {
				orgId,
				tourId,
				date: DATE,
				startTime: "09:00",
				endTime: "11:00",
				capacityTotal: 10,
			});
			const afternoon = await seedSchedule(ctx, {
				orgId,
				tourId,
				date: DATE,
				startTime: "14:00",
				endTime: "16:00",
				capacityTotal: 10,
			});
			await seedOtaProduct(ctx, orgId, integrationId, tourId);
			return { tourId, morning, afternoon };
		});

		// Booked on the morning slot, then the operator moves the
		// reservation to the afternoon departure.
		// eslint-disable-next-line no-console
		console.log("DBG norm pre-check: payloads carry time");
		const n1 = ViatorClient.normalize({
			eventType: "BOOKING_CREATED",
			reservation: { id: "N1", productCode: "P-100",
				customer: { name: "A", email: "a@a.com" }, guests: 2,
				startDateTime: `${DATE}T09:00:00Z`,
				tour: { date: DATE, time: "09:00" },
				totalPaid: 100, currency: "USD", commissionAmount: 20 },
		}) as any;
		// eslint-disable-next-line no-console
		console.log("DBG norm:", JSON.stringify({ tourDate: n1.tourDate, tourTime: n1.tourTime, productId: n1.productId }));
		await upsertViaViator(t, orgId, integrationId, "VR-F702-4", {
			guests: 2,
			startDateTime: `${DATE}T09:00:00Z`,
			time: "09:00",
		});
		await upsertViaViator(t, orgId, integrationId, "VR-F702-4", {
			guests: 2,
			startDateTime: `${DATE}T14:00:00Z`,
			time: "14:00",
		});

		const dbg = await t.run(async (ctx) => ({
			rows: (await ctx.db.query("otaBookings").collect()).map((r: any) => ({
				res: r.otaReservationId,
				scheduleId: String(r.scheduleId),
				status: r.status,
				guests: r.otaGuests,
			})),
			projections: (await ctx.db.query("tourAvailability").collect()).map((d: any) => ({
				date: d.date,
				slots: d.slots.map((s: any) => [String(s.scheduleId), s.capacityBooked]),
			})),
			schedules: (await ctx.db.query("tourSchedules").collect()).map((s: any) => ({
				id: String(s._id), date: s.date, start: s.startTime, status: s.status,
			})),
		}));
		// eslint-disable-next-line no-console
		console.log("DBG move:", JSON.stringify({ morning: String(morning), afternoon: String(afternoon), dbg }));
		const movedFrom = await projectionSlot(t, tourId, morning);
		const movedTo = await projectionSlot(t, tourId, afternoon);
		expect(movedFrom?.capacityBooked).toBe(0);
		expect(movedTo?.capacityBooked).toBe(2);
	});
});
