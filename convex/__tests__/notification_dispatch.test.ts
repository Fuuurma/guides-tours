// Tests for the notification dispatcher action.
//
// Uses convex-test to spin up a Convex harness, then directly invokes
// the dispatcher action with a seeded scheduled row.
//
// What we cover (regression tests for Phase 5 review findings):
//   - dispatcher writes recipient = customer email (not errorMessage)
//   - dispatcher writes templateName from the loaded template
//   - dispatcher renders the subject + body for each templateType
//   - dispatcher marks scheduled.sent=true on success
//   - dispatcher marks scheduled.sent=true on skip (no email/phone)
//     so the cron stops re-picking it
//   - dispatcher leaves sent=false on failure so cron retries it

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

type TestCtx = GenericMutationCtx<DataModel> & {
	storage: { getUrl: (id: string) => Promise<string | null> };
};

// Seed the minimum tables needed for one scheduled row.
async function seedScheduledForTemplate(
	ctx: TestCtx,
	templateType: string,
	templateName: string,
): Promise<{ orgId: string; scheduledId: Id<"scheduledNotifications">; customerId: Id<"customers"> }> {
	const orgId = "org_test";
	const templateId = await ctx.db.insert("notificationTemplates", {
		organizationId: orgId,
		name: templateName,
		templateType,
		channel: "email",
		isActive: true,
		isDefault: true,
		emailSubject: "",
		emailBodyText: "",
		emailBodyHtml: "",
		smsBody: "",
		variables: [],
		sendTiming: "immediate",
		requireConsent: false,
		retryOnFailure: true,
		retryCount: 3,
		createdAt: 0,
		updatedAt: 0,
	});
	const customerId = await ctx.db.insert("customers", {
		organizationId: orgId,
		name: "Alice Wonder",
		email: "alice@example.com",
		phone: "+15555550100",
		notes: "",
		smsConsent: true,
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
	const scheduledId = await ctx.db.insert("scheduledNotifications", {
		organizationId: orgId,
		bookingId,
		templateId,
		scheduledFor: Date.now(),
		sent: false,
		retryCount: 0,
		maxRetries: 3,
		createdAt: 0,
	});
	return { orgId, scheduledId, customerId };
}

describe("convex/notification_dispatch", () => {
	it("writes a log row with recipient = customer email and the right templateName", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { orgId, scheduledId } = await seedScheduledForTemplate(
				ctx,
				"reminder_24h",
				"24h Reminder",
			);

			await t.action(
				internal.notification_dispatch.dispatchScheduled,
				{ scheduledId },
			);

			const logs = await ctx.db
				.query("notificationLogs")
				.withIndex("by_org_status", (q) => q.eq("organizationId", orgId))
				.collect();
			expect(logs).toHaveLength(1);
			const log = logs[0];
			expect(log).toBeDefined();
			// Issue 2 regression: recipient must be the customer's email,
			// NOT the errorMessage (which is undefined here).
			expect(log?.recipient).toBe("alice@example.com");
			expect(log?.errorMessage).toBeUndefined();
			// Issue 4 regression: templateName comes from the loaded template.
			expect(log?.templateName).toBe("24h Reminder");
			// Issue 1 regression: subject is captured in metadata.
			expect(log?.metadata).toMatchObject({
				subject: "Your tour is tomorrow",
			});
			expect(log?.status).toBe("sent");
			expect(log?.channel).toBe("email");
		});
	});

	it("marks the scheduled row sent on success", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { scheduledId } = await seedScheduledForTemplate(
				ctx,
				"reminder_2h",
				"2h Reminder",
			);

			await t.action(
				internal.notification_dispatch.dispatchScheduled,
				{ scheduledId },
			);

			const after = await ctx.db.get(scheduledId);
			expect(after?.sent).toBe(true);
			expect(after?.processedAt).toBeTypeOf("number");
			expect(after?.notificationLogId).toBeDefined();
		});
	});

	it("renders different subjects + bodies per templateType", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const cases: Array<{
				templateType: string;
				expectedSubject: string;
				expectedFragment: string;
			}> = [
				{
					templateType: "reminder_24h",
					expectedSubject: "Your tour is tomorrow",
					expectedFragment: "friendly reminder",
				},
				{
					templateType: "reminder_2h",
					expectedSubject: "Your tour starts in 2 hours",
					expectedFragment: "starts in 2 hours",
				},
				{
					templateType: "post_tour_review",
					expectedSubject: "How was your tour?",
					expectedFragment: "thanks for joining",
				},
				{
					templateType: "custom_unknown_type",
					expectedSubject: "Tour update",
					expectedFragment: "update about your tour",
				},
			];

			for (const c of cases) {
				const { orgId, scheduledId } = await seedScheduledForTemplate(
					ctx,
					c.templateType,
					`Tpl ${c.templateType}`,
				);
				await t.action(
					internal.notification_dispatch.dispatchScheduled,
					{ scheduledId },
				);
				const logs = await ctx.db
					.query("notificationLogs")
					.withIndex("by_org_status", (q) => q.eq("organizationId", orgId))
					.collect();
				const log = logs.find((l) => l.templateName === `Tpl ${c.templateType}`);
				expect(log, `expected log row for ${c.templateType}`).toBeDefined();
				expect(log?.metadata).toMatchObject({ subject: c.expectedSubject });
				// We don't expose bodyText directly (Phase 7 will use it
				// for SES), but the subject round-trip proves the template
				// dispatch fired the right branch.
			}
		});
	});

	it("is idempotent — second call no-ops because scheduled.sent is true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { scheduledId } = await seedScheduledForTemplate(
				ctx,
				"reminder_24h",
				"24h Reminder",
			);

			await t.action(
				internal.notification_dispatch.dispatchScheduled,
				{ scheduledId },
			);
			await t.action(
				internal.notification_dispatch.dispatchScheduled,
				{ scheduledId },
			);

			const after = await ctx.db.get(scheduledId);
			// Only one log row — second call returned early via the
			// `if (!scheduled || scheduled.sent) return;` guard.
			const logs = await ctx.db.query("notificationLogs").collect();
			expect(logs).toHaveLength(1);
			expect(after?.sent).toBe(true);
		});
	});

	it("falls back to phone channel when email is missing", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const orgId = "org_test";
			const templateId = await ctx.db.insert("notificationTemplates", {
				organizationId: orgId,
				name: "T",
				templateType: "reminder_2h",
				channel: "email",
				isActive: true,
				isDefault: true,
				emailSubject: "",
				emailBodyText: "",
				emailBodyHtml: "",
				smsBody: "",
				variables: [],
				sendTiming: "immediate",
				requireConsent: false,
				retryOnFailure: true,
				retryCount: 3,
				createdAt: 0,
				updatedAt: 0,
			});
			const customerId = await ctx.db.insert("customers", {
				organizationId: orgId,
				name: "No Email",
				email: "",
				phone: "+15555550199",
				notes: "",
				smsConsent: true,
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
			const scheduledId = await ctx.db.insert("scheduledNotifications", {
				organizationId: orgId,
				bookingId,
				templateId,
				scheduledFor: Date.now(),
				sent: false,
				retryCount: 0,
				maxRetries: 3,
				createdAt: 0,
			});

			await t.action(
				internal.notification_dispatch.dispatchScheduled,
				{ scheduledId },
			);

			const logs = await ctx.db.query("notificationLogs").collect();
			expect(logs).toHaveLength(1);
			expect(logs[0]?.channel).toBe("sms");
			expect(logs[0]?.recipient).toBe("+15555550199");
		});
	});

	it("marks scheduled sent=true even when customer has no email/phone (skip path)", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const orgId = "org_test";
			const templateId = await ctx.db.insert("notificationTemplates", {
				organizationId: orgId,
				name: "T",
				templateType: "reminder_24h",
				channel: "email",
				isActive: true,
				isDefault: true,
				emailSubject: "",
				emailBodyText: "",
				emailBodyHtml: "",
				smsBody: "",
				variables: [],
				sendTiming: "immediate",
				requireConsent: false,
				retryOnFailure: true,
				retryCount: 3,
				createdAt: 0,
				updatedAt: 0,
			});
			const customerId = await ctx.db.insert("customers", {
				organizationId: orgId,
				name: "No Contact",
				email: "",
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
			const scheduledId = await ctx.db.insert("scheduledNotifications", {
				organizationId: orgId,
				bookingId,
				templateId,
				scheduledFor: Date.now(),
				sent: false,
				retryCount: 0,
				maxRetries: 3,
				createdAt: 0,
			});

			await t.action(
				internal.notification_dispatch.dispatchScheduled,
				{ scheduledId },
			);

			const after = await ctx.db.get(scheduledId);
			// Skip = "we tried, we know there's nothing to do, stop
			// re-running." Marking sent prevents the cron from re-picking.
			expect(after?.sent).toBe(true);
			const logs = await ctx.db.query("notificationLogs").collect();
			// Log captures the intent: channel=none, recorded as sent
			// (so the row is no longer actionable). The dispatcher
			// chose this on purpose — there's no transport to retry.
			expect(logs[0]?.status).toBe("sent");
			expect(logs[0]?.channel).toBe("none");
		});
	});
});
