// Tests for the cron-scheduled internal mutations.
//
// Uses convex-test to spin up a real Convex harness backed by an
// in-memory database. Each test seeds the schema with the minimum
// rows needed and asserts on the post-condition.
//
// What we cover:
//   - processPendingNotifications: only picks sent=false within the
//     cutoff window; enqueues an action for each; respects retry
//     backoff on enqueue failure (no failure path tested because
//     runAfter is hard to make fail in convex-test).
//   - cleanupOldAssignments: only soft-deletes completed/cancelled
//     assignments older than the cutoff; leaves newer + scheduled
//     rows alone.
//   - cleanupOldNotifications: hard-deletes both notificationLogs
//     and completed scheduledNotifications older than the cutoff.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../schema";
import { internal } from "../../_generated/api";

const modules = import.meta.glob("../../**/*.{ts,tsx}");

describe("convex/crons — processPendingNotifications", () => {
	it("enqueues an action for each sent=false row in the cutoff window", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const orgId = "org_test";
			const templateId = await ctx.db.insert("notificationTemplates", {
				organizationId: orgId,
				name: "Reminder 24h",
				templateType: "reminder_24h",
				channel: "email",
				isActive: true,
				isDefault: true,
				emailSubject: "",
				emailBodyText: "",
				emailBodyHtml: "",
				smsBody: "",
				variables: [],
				sendTiming: "24h_before",
				requireConsent: false,
				retryOnFailure: true,
				retryCount: 3,
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
				emailConsent: true,
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
			const tourId = await ctx.db.insert("tours", {
				organizationId: orgId,
				name: "Old Town Walk",
				description: "",
				durationHours: 2,
				isActive: true,
				recurrenceType: "none",
				recurrenceDaysOfWeek: [],
				capacity: 15,
				bufferMinutes: 15,
				minGuests: 1,
				maxGuests: 15,
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
			const bookingId = await ctx.db.insert("bookings", {
				organizationId: orgId,
				tourId,
				customerId,
				date: "2026-07-01",
				startTime: "10:00",
				guests: 2,
				guestNames: "",
				languageRequired: "",
				notes: "",
				status: "confirmed",
				depositAmountCents: 0n,
				totalAmountCents: 0n,
				balanceDueCents: 0n,
				paymentMethod: "",
				checkedInBy: "",
				netRevenueCents: 0n,
				source: "",
				reviewComment: "",
				createdAt: 0,
				updatedAt: 0,
			});

			// Two pending rows (due now) + one already-sent row.
			const dueA = await ctx.db.insert("scheduledNotifications", {
				organizationId: orgId,
				bookingId,
				templateId,
				scheduledFor: Date.now() - 60_000, // 1 min ago
				sent: false,
				retryCount: 0,
				maxRetries: 3,
				createdAt: 0,
			});
			const dueB = await ctx.db.insert("scheduledNotifications", {
				organizationId: orgId,
				bookingId,
				templateId,
				scheduledFor: Date.now() + 60_000, // 1 min from now (within +10min cutoff)
				sent: false,
				retryCount: 0,
				maxRetries: 3,
				createdAt: 0,
			});
			const tooFarFuture = await ctx.db.insert(
				"scheduledNotifications",
				{
					organizationId: orgId,
					bookingId,
					templateId,
					scheduledFor: Date.now() + 60 * 60_000, // 1 hour out (beyond +10min cutoff)
					sent: false,
					retryCount: 0,
					maxRetries: 3,
					createdAt: 0,
				},
			);
			const alreadySent = await ctx.db.insert(
				"scheduledNotifications",
				{
					organizationId: orgId,
					bookingId,
					templateId,
					scheduledFor: Date.now(),
					sent: true, // <-- not picked up
					retryCount: 0,
					maxRetries: 3,
					processedAt: Date.now(),
					createdAt: 0,
				},
			);

			const result = await t.mutation(
				internal.notifications.processPendingNotifications,
				{},
			);

			// expect 2 processed, 0 failed
			expect(result).toMatchObject({
				processed: 2,
				failed: 0,
			});

			// Sent rows are still sent; pending rows not yet marked sent
			// (that's the dispatcher's job).
			const stillPending = await ctx.db.get(dueA);
			expect(stillPending?.sent).toBe(false);
			const futurePending = await ctx.db.get(tooFarFuture);
			expect(futurePending?.sent).toBe(false);
			const sentRow = await ctx.db.get(alreadySent);
			expect(sentRow?.sent).toBe(true);
			// dueA is referenced — silence unused warning
			void dueB;
		});
	});
});

describe("convex/crons — cleanupOldAssignments", () => {
	it("soft-deletes only completed/cancelled assignments older than 90 days", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const orgId = "org_test";
			const tourId = await ctx.db.insert("tours", {
				organizationId: orgId,
				name: "T",
				description: "",
				durationHours: 1,
				isActive: true,
				recurrenceType: "none",
				recurrenceDaysOfWeek: [],
				capacity: 1,
				bufferMinutes: 0,
				minGuests: 1,
				maxGuests: 1,
				bookingCutoffHours: 0,
				tourType: "walkable",
				languages: [],
				requiredGuides: 1,
				inclusions: [],
				exclusions: [],
				highlights: [],
				currency: "USD",
				createdAt: 0,
				updatedAt: 0,
			});
			const longAgo = new Date(
				Date.now() - 100 * 24 * 60 * 60 * 1000,
			)
				.toISOString()
				.slice(0, 10);
			const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
				.toISOString()
				.slice(0, 10);

			const oldCompleted = await ctx.db.insert("assignments", {
				organizationId: orgId,
				tourId,
				guideId: "u1",
				date: longAgo,
				startTime: "09:00",
				status: "completed",
				createdAt: 0,
				updatedAt: 0,
			});
			const oldCancelled = await ctx.db.insert("assignments", {
				organizationId: orgId,
				tourId,
				guideId: "u2",
				date: longAgo,
				startTime: "09:00",
				status: "cancelled",
				createdAt: 0,
				updatedAt: 0,
			});
			const oldScheduled = await ctx.db.insert("assignments", {
				organizationId: orgId,
				tourId,
				guideId: "u3",
				date: longAgo,
				startTime: "09:00",
				status: "scheduled",
				createdAt: 0,
				updatedAt: 0,
			});
			const recentCompleted = await ctx.db.insert("assignments", {
				organizationId: orgId,
				tourId,
				guideId: "u4",
				date: recent,
				startTime: "09:00",
				status: "completed",
				createdAt: 0,
				updatedAt: 0,
			});

			const result = await t.mutation(
				internal.notifications.cleanupOldAssignments,
				{},
			);

			expect(result.archived).toBe(2);

			expect((await ctx.db.get(oldCompleted))?.deletedAt).toBeDefined();
			expect((await ctx.db.get(oldCancelled))?.deletedAt).toBeDefined();
			expect((await ctx.db.get(oldScheduled))?.deletedAt).toBeUndefined();
			expect((await ctx.db.get(recentCompleted))?.deletedAt).toBeUndefined();
		});
	});
});

describe("convex/crons — cleanupOldNotifications", () => {
	it("hard-deletes logs and completed scheduled rows older than 30 days", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const orgId = "org_test";
			const templateId = await ctx.db.insert("notificationTemplates", {
				organizationId: orgId,
				name: "Test",
				templateType: "reminder_24h",
				channel: "email",
				isActive: true,
				isDefault: true,
				emailSubject: "",
				emailBodyText: "",
				emailBodyHtml: "",
				smsBody: "",
				variables: [],
				sendTiming: "24h_before",
				requireConsent: false,
				retryOnFailure: true,
				retryCount: 3,
				createdAt: 0,
				updatedAt: 0,
			});
			const customerId = await ctx.db.insert("customers", {
				organizationId: orgId,
				name: "A",
				email: "a@x.com",
				phone: "",
				notes: "",
				smsConsent: false,
				emailConsent: true,
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
			const tourId = await ctx.db.insert("tours", {
				organizationId: orgId,
				name: "T",
				description: "",
				durationHours: 1,
				isActive: true,
				recurrenceType: "none",
				recurrenceDaysOfWeek: [],
				capacity: 1,
				bufferMinutes: 0,
				minGuests: 1,
				maxGuests: 1,
				bookingCutoffHours: 0,
				tourType: "walkable",
				languages: [],
				requiredGuides: 1,
				inclusions: [],
				exclusions: [],
				highlights: [],
				currency: "USD",
				createdAt: 0,
				updatedAt: 0,
			});
			const bookingId = await ctx.db.insert("bookings", {
				organizationId: orgId,
				tourId,
				customerId,
				date: "2026-01-01",
				startTime: "00:00",
				guests: 1,
				guestNames: "",
				languageRequired: "",
				notes: "",
				status: "confirmed",
				depositAmountCents: 0n,
				totalAmountCents: 0n,
				balanceDueCents: 0n,
				paymentMethod: "",
				checkedInBy: "",
				netRevenueCents: 0n,
				source: "",
				reviewComment: "",
				createdAt: 0,
				updatedAt: 0,
			});

			const old = Date.now() - 60 * 24 * 60 * 60 * 1000;
			const recent = Date.now() - 5 * 24 * 60 * 60 * 1000;

			const oldLog = await ctx.db.insert("notificationLogs", {
				organizationId: orgId,
				templateId,
				templateName: "",
				channel: "email",
				recipient: "a@x.com",
				status: "sent",
				metadata: {},
				createdAt: old,
				sentAt: old,
			});
			const recentLog = await ctx.db.insert("notificationLogs", {
				organizationId: orgId,
				templateId,
				templateName: "",
				channel: "email",
				recipient: "a@x.com",
				status: "sent",
				metadata: {},
				createdAt: recent,
				sentAt: recent,
			});

			const oldScheduled = await ctx.db.insert(
				"scheduledNotifications",
				{
					organizationId: orgId,
					bookingId,
					templateId,
					scheduledFor: old,
					sent: true,
					retryCount: 0,
					maxRetries: 3,
					processedAt: old,
					createdAt: old,
				},
			);
			const pendingScheduled = await ctx.db.insert(
				"scheduledNotifications",
				{
					organizationId: orgId,
					bookingId,
					templateId,
					scheduledFor: recent,
					sent: false,
					retryCount: 0,
					maxRetries: 3,
					createdAt: recent,
				},
			);

			const result = await t.mutation(
				internal.notifications.cleanupOldNotifications,
				{},
			);

			expect(result.logsDeleted).toBe(1);
			expect(result.scheduledDeleted).toBe(1);

			expect(await ctx.db.get(oldLog)).toBeNull();
			expect(await ctx.db.get(recentLog)).not.toBeNull();
			expect(await ctx.db.get(oldScheduled)).toBeNull();
			expect(await ctx.db.get(pendingScheduled)).not.toBeNull();
		});
	});
});

describe("convex/crons — crons.ts schedule shape", () => {
	it("declares the 3 expected scheduled functions with the right schedules", async () => {
		// Re-import the file as text and assert the cron schedule calls.
		// This is a string-level test — cheap regression guard for
		// schedule shape without needing convex-test to load crons.
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const cronsSource = readFileSync(
			resolve(__dirname, "../../crons.ts"),
			"utf8",
		);
		expect(cronsSource).toMatch(
			/crons\.interval\(\s*"process_pending_notifications"/,
		);
		expect(cronsSource).toMatch(/minutes:\s*5/);
		expect(cronsSource).toMatch(
			/crons\.daily\(\s*"cleanup_old_assignments"/,
		);
		expect(cronsSource).toMatch(/hourUTC:\s*3/);
		expect(cronsSource).toMatch(
			/crons\.daily\(\s*"cleanup_old_notifications"/,
		);
		expect(cronsSource).toMatch(/hourUTC:\s*4/);
	});
});
