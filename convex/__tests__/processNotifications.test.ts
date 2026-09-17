// Integration test for the cron job that processes scheduled notifications.
//
// Wires together: bookings.create → scheduleForBooking →
// processPendingNotifications → notification_dispatch (skipped, as
// the action only enqueues; the test asserts the cron side).

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function seedTour(ctx: any, orgId: string) {
	return await ctx.db.insert("tours", {
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
}

async function seedCustomer(ctx: any, orgId: string) {
	return await ctx.db.insert("customers", {
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
}

async function seedTemplate(ctx: any, orgId: string, type: string) {
	return await ctx.db.insert("notificationTemplates", {
		organizationId: orgId,
		name: type,
		templateType: type,
		channel: "email",
		isActive: true,
		isDefault: false,
		emailSubject: "subj",
		emailBodyText: "txt",
		emailBodyHtml: "",
		smsBody: "",
		variables: [],
		sendTiming: type === "reminder_24h" ? "24h_before" : "2h_before",
		requireConsent: false,
		retryOnFailure: true,
		retryCount: 3,
		createdAt: 0,
		updatedAt: 0,
	});
}

async function seedBooking(ctx: any, orgId: string, tourId: any, customerId: any) {
	return await ctx.db.insert("bookings", {
		organizationId: orgId,
		tourId,
		customerId,
		date: "2026-12-31",
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

describe("processPendingNotifications (cron)", () => {
	it("schedules reminders + processes due ones", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pc1";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const customerId = await t.run((ctx) => seedCustomer(ctx, orgId));
		await t.run((ctx) => seedTemplate(ctx, orgId, "reminder_24h"));
		await t.run((ctx) => seedTemplate(ctx, orgId, "reminder_2h"));
		const bookingId = await t.run((ctx) =>
			seedBooking(ctx, orgId, tourId, customerId),
		);
		// scheduleForBooking schedules 24h + 2h reminders for future booking
		const ids = await t.mutation(
			internal.scheduledNotifications.scheduleForBooking,
			{
				organizationId: orgId,
				bookingId,
				date: "2026-12-31",
				startTime: "10:00",
			},
		);
		expect(ids.length).toBe(2);

		// Both reminders are in the future, so cron shouldn't mark any as sent
		const result1 = await t.mutation(
			internal.notifications.processPendingNotifications,
		);
		expect(result1.dueCount).toBe(0);

		// Backdate the 24h reminder so it's "due" right now
		await t.run(async (ctx) => {
			await ctx.db.patch(ids[0]!, {
				scheduledFor: Date.now() - 60_000,
			});
		});
		const result2 = await t.mutation(
			internal.notifications.processPendingNotifications,
		);
		expect(result2.dueCount).toBe(1);
		// The cron uses scheduler.runAfter(0, ...) to enqueue dispatch, so
		// we can't observe the dispatch result synchronously in tests.
		// But the cron should have counted it as processed.
		expect(result2.processed + result2.failed).toBeGreaterThan(0);
	});

	it("drops reminders older than cutoff window", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pc2";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const customerId = await t.run((ctx) => seedCustomer(ctx, orgId));
		const templateId = await t.run((ctx) =>
			seedTemplate(ctx, orgId, "reminder_24h"),
		);
		const bookingId = await t.run((ctx) =>
			seedBooking(ctx, orgId, tourId, customerId),
		);
		// Insert a stale notification (way in the past)
		await t.run((ctx) =>
			ctx.db.insert("scheduledNotifications", {
				organizationId: orgId,
				bookingId,
				templateId,
				scheduledFor: Date.now() - 24 * 60 * 60_000, // 1 day ago
				sent: false,
				retryCount: 0,
				maxRetries: 3,
				createdAt: 0,
			}),
		);
		const result = await t.mutation(
			internal.notifications.processPendingNotifications,
		);
		// The stale row is outside the 10-min cutoff window; it should
		// be in dueCount but not in processed/failed.
		expect(result.dueCount).toBe(1);
		expect(result.processed).toBe(0);
		expect(result.failed).toBe(0);
		// F47: the stale row must be RETIRED (deleted), not left
		// sent=false at the head of by_sent_scheduled forever.
		const remaining = await t.run((ctx) =>
			ctx.db.query("scheduledNotifications").collect(),
		);
		expect(remaining.length).toBe(0);
	});

	it("retired stale rows can't starve the pending window", async () => {
		// F47 regression pin: >BATCH_SIZE stale rows used to occupy the
		// take(100) head forever, blocking every eligible row behind
		// them. Now each tick deletes the stale subset it scans.
		const t = convexTest(schema, modules);
		const orgId = "org_pc3";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const customerId = await t.run((ctx) => seedCustomer(ctx, orgId));
		const templateId = await t.run((ctx) =>
			seedTemplate(ctx, orgId, "reminder_24h"),
		);
		const bookingId = await t.run((ctx) =>
			seedBooking(ctx, orgId, tourId, customerId),
		);
		const staleFor = Date.now() - 24 * 60 * 60_000;
		const dueFor = Date.now() - 60_000;
		const eligibleId = await t.run(async (ctx) => {
			// 150 stale rows (> BATCH_SIZE=100) + 1 eligible row at the
			// tail of the index window.
			for (let i = 0; i < 150; i++) {
				await ctx.db.insert("scheduledNotifications", {
					organizationId: orgId,
					bookingId,
					templateId,
					scheduledFor: staleFor - i,
					sent: false,
					retryCount: 0,
					maxRetries: 3,
					createdAt: 0,
				});
			}
			return await ctx.db.insert("scheduledNotifications", {
				organizationId: orgId,
				bookingId,
				templateId,
				scheduledFor: dueFor,
				sent: false,
				retryCount: 0,
				maxRetries: 3,
				createdAt: 0,
			});
		});

		// Tick 1: scans the 100-row head = 100 stale + the eligible row
		// is beyond the window — deletes the 100 stale.
		const r1 = await t.mutation(
			internal.notifications.processPendingNotifications,
		);
		expect(r1.dueCount).toBe(100);
		// Tick 2: the next 50 stale + the eligible row.
		const r2 = await t.mutation(
			internal.notifications.processPendingNotifications,
		);
		expect(r2.dueCount).toBe(51);
		expect(r2.processed + r2.failed).toBe(1);
		// Tick 3: only the (now enqueued) eligible row remains until
		// dispatch marks it sent — and no stale rows at all.
		const remaining = await t.run((ctx) =>
			ctx.db
				.query("scheduledNotifications")
				.withIndex("by_sent_scheduled", (q) => q.eq("sent", false))
				.collect(),
		);
		expect(remaining.length).toBeLessThanOrEqual(1);
		expect(
			remaining.every((r: any) => r._id === eligibleId),
		).toBe(true);
	});

	it("cleanupOldAssignments pages past the archived prefix (F49)", async () => {
		// Old take(5000) + JS deletedAt filter scanned the same archived
		// head every run and progressed 0 rows once 5000 archived
		// accumulated. The paginated walk must reach the unarchived
		// tail — proven here with a >PAGE (2000) archived prefix.
		const t = convexTest(schema, modules);
		const orgId = "org_ca1";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const oldDate = "2020-01-01"; // far past the 90-day cutoff
		const liveId = await t.run(async (ctx) => {
			// PAGE+50 already-archived rows occupy the index head.
			for (let i = 0; i < 2050; i++) {
				await ctx.db.insert("assignments", {
					organizationId: orgId,
					tourId,
					guideId: "g-archived",
					date: oldDate,
					startTime: "09:00",
					status: "completed",
					createdAt: 0,
					updatedAt: 0,
					deletedAt: 1,
				});
			}
			// The unarchived tail — the row the old code could never reach.
			return await ctx.db.insert("assignments", {
				organizationId: orgId,
				tourId,
				guideId: "g-live",
				date: oldDate,
				startTime: "10:00",
				status: "completed",
				createdAt: 0,
				updatedAt: 0,
			});
		});

		// Drive the continuation cursor manually — same shape as the
		// staffingDigest cursor test.
		let cursor: string | undefined;
		let pages = 0;
		let archived = 0;
		for (;;) {
			const r = await t.mutation(
				internal.notifications.cleanupOldAssignments,
				{ status: "completed", cursor },
			);
			pages += 1;
			archived += r.archived;
			if (r.done) break;
			cursor = r.continueCursor;
		}
		expect(pages).toBeGreaterThan(1);
		expect(archived).toBe(1);
		const row = await t.run((ctx) => ctx.db.get(liveId));
		expect(row?.deletedAt).toBeGreaterThan(0);
	});
});