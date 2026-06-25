import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

// Future date = 30 days from "now" so both 24h and 2h reminders fire.
const FUTURE_DATE = (() => {
	const d = new Date(Date.now() + 30 * 24 * 3_600_000);
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
})();

// Past date = 30 days ago — both reminders should be skipped.
const PAST_DATE = (() => {
	const d = new Date(Date.now() - 30 * 24 * 3_600_000);
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
})();

async function seedTemplate(
	ctx: any,
	orgId: string,
	templateType: string,
	retryCount = 3,
) {
	return await ctx.db.insert("notificationTemplates", {
		organizationId: orgId,
		name: `${templateType} template`,
		templateType,
		channel: "email",
		isActive: true,
		isDefault: false,
		emailSubject: "subj",
		emailBodyText: "txt",
		emailBodyHtml: "",
		smsBody: "",
		variables: [],
		sendTiming: templateType === "reminder_24h" ? "24h_before" : "2h_before",
		requireConsent: false,
		retryOnFailure: true,
		retryCount,
		createdAt: 0,
		updatedAt: 0,
	});
}

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
		name: "Alice",
		email: "alice@example.com",
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
		date: FUTURE_DATE,
		startTime: "10:00",
		guests: 2,
		guestNames: "",
		languageRequired: "en",
		notes: "",
		status: "confirmed",
		depositAmountCents: 0n,
		totalAmountCents: 0n,
		balanceDueCents: 0n,
		paymentMethod: "",
		checkedInBy: "",
		netRevenueCents: 0n,
		source: "direct",
		reviewComment: "",
		createdAt: 0,
		updatedAt: 0,
	});
}

describe("scheduleForBooking", () => {
	it("creates 24h + 2h reminders for future booking", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_sn1";
		await t.run((ctx) => seedTemplate(ctx, orgId, "reminder_24h"));
		await t.run((ctx) => seedTemplate(ctx, orgId, "reminder_2h"));
		const bookingId = await t.run((ctx) => seedBooking(ctx, orgId));
		const ids = await t.mutation(
			internal.scheduledNotifications.scheduleForBooking,
			{
				organizationId: orgId,
				bookingId,
				date: FUTURE_DATE,
				startTime: "10:00",
			},
		);
		expect(ids.length).toBe(2);
		const rows = (await t.run((ctx) =>
			ctx.db.query("scheduledNotifications").collect(),
		)) as any;
		expect(rows.length).toBe(2);
		// Just check both are in the future and not yet sent
		for (const r of rows) {
			expect(r.scheduledFor).toBeGreaterThan(Date.now() - 1000);
			expect(r.sent).toBe(false);
			expect(r.retryCount).toBe(0);
		}
	});

	it("schedules 24h reminder for a booking 25h+ in the future", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_sn2";
		await t.run((ctx) => seedTemplate(ctx, orgId, "reminder_24h"));
		await t.run((ctx) => seedTemplate(ctx, orgId, "reminder_2h"));
		const bookingId = await t.run((ctx) => seedBooking(ctx, orgId));
		await t.mutation(
			internal.scheduledNotifications.scheduleForBooking,
			{
				organizationId: orgId,
				bookingId,
				date: FUTURE_DATE,
				startTime: "10:00",
			},
		);
		const rows = (await t.run((ctx) =>
			ctx.db
				.query("scheduledNotifications")
				.filter((q) => q.eq(q.field("organizationId"), orgId))
				.collect(),
		)) as any;
		// Both reminders scheduled
		expect(rows.length).toBe(2);
		const sendTimes = rows.map((r: any) => r.scheduledFor).sort();
		// The 24h reminder (smaller offset) should fire ~24h before, the 2h reminder ~2h before.
		// Sorted ascending: 2h reminder is later (closer to tour), 24h is earlier.
		expect(sendTimes[1] - sendTimes[0]).toBeGreaterThan(20 * 3_600_000);
	});

	it("skips past reminders silently", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_sn3";
		await t.run((ctx) => seedTemplate(ctx, orgId, "reminder_24h"));
		await t.run((ctx) => seedTemplate(ctx, orgId, "reminder_2h"));
		// Insert a booking in the past
		const tourId = await t.run((ctx) =>
			ctx.db.insert("tours", {
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
			}),
		);
		const customerId = await t.run((ctx) =>
			ctx.db.insert("customers", {
				organizationId: orgId,
				name: "X",
				email: "x@x.com",
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
			}),
		);
		const bookingId = await t.run((ctx) =>
			ctx.db.insert("bookings", {
				organizationId: orgId,
				tourId,
				customerId,
				date: PAST_DATE,
				startTime: "10:00",
				guests: 2,
				guestNames: "",
				languageRequired: "en",
				notes: "",
				status: "confirmed",
				depositAmountCents: 0n,
				totalAmountCents: 0n,
				balanceDueCents: 0n,
				paymentMethod: "",
				checkedInBy: "",
				netRevenueCents: 0n,
				source: "direct",
				reviewComment: "",
				createdAt: 0,
				updatedAt: 0,
			}),
		);
		const ids = await t.mutation(
			internal.scheduledNotifications.scheduleForBooking,
			{
				organizationId: orgId,
				bookingId,
				date: PAST_DATE,
				startTime: "10:00",
			},
		);
		expect(ids.length).toBe(0);
	});

	it("skips missing template gracefully", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_sn4";
		// Only seed the 24h template, not 2h
		await t.run((ctx) => seedTemplate(ctx, orgId, "reminder_24h"));
		const bookingId = await t.run((ctx) => seedBooking(ctx, orgId));
		const ids = await t.mutation(
			internal.scheduledNotifications.scheduleForBooking,
			{
				organizationId: orgId,
				bookingId,
				date: FUTURE_DATE,
				startTime: "10:00",
			},
		);
		expect(ids.length).toBe(1);
	});

	it("rejects invalid date format", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_sn5";
		const bookingId = await t.run((ctx) => seedBooking(ctx, orgId));
		await expect(
			t.mutation(
				internal.scheduledNotifications.scheduleForBooking,
				{
					organizationId: orgId,
					bookingId,
					date: "not-a-date",
					startTime: "10:00",
				},
			),
		).rejects.toThrow(/invalid date/);
	});

	it("respects template max retries", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_sn6";
		await t.run((ctx) => seedTemplate(ctx, orgId, "reminder_24h", 5));
		const bookingId = await t.run((ctx) => seedBooking(ctx, orgId));
		await t.mutation(
			internal.scheduledNotifications.scheduleForBooking,
			{
				organizationId: orgId,
				bookingId,
				date: FUTURE_DATE,
				startTime: "10:00",
			},
		);
		const row = (await t.run((ctx) =>
			ctx.db
				.query("scheduledNotifications")
				.filter((q) => q.eq(q.field("organizationId"), orgId))
				.first(),
		)) as any;
		expect(row?.maxRetries).toBe(5);
	});
});
