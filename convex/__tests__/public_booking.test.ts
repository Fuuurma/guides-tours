// Tests for the public booking flow.
//
// We test the internalCreate mutation directly. The httpAction
// wrapper is intentionally not tested in vitest (Convex action/http
// testing requires the live runtime — see convex/http.ts).

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

async function seedTour(
	ctx: TestCtx,
	orgId: string,
	maxGuests = 15,
	isActive = true,
): Promise<Id<"tours">> {
	return await ctx.db.insert("tours", {
		organizationId: orgId,
		name: "Old Town Walk",
		description: "",
		durationHours: 2,
		isActive,
		recurrenceType: "none",
		recurrenceDaysOfWeek: [],
		capacity: maxGuests,
		bufferMinutes: 15,
		minGuests: 1,
		maxGuests,
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
}

describe("convex/public_booking — internalCreate mutation", () => {
	it("creates a confirmed booking for a valid tour in the org", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_a";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const bookingId = await t.mutation(
			internal.public_booking.internalCreate,
			{
				organizationId: orgId,
				tourId,
				customerName: "Alice Visitor",
				customerEmail: "alice@example.com",
				date: "2026-08-15",
				startTime: "10:00",
				guests: 2,
			},
		);
		const booking = await t.run(async (ctx) =>
			ctx.db.get(bookingId),
		);
		expect(booking).not.toBeNull();
		expect(booking?.status).toBe("confirmed");
		expect(booking?.source).toBe("public_booking");
	});

	it("get-or-create customer: re-uses existing customer for same email", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_b";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const bookingId1 = await t.mutation(
			internal.public_booking.internalCreate,
			{
				organizationId: orgId,
				tourId,
				customerName: "Bob",
				customerEmail: "bob@example.com",
				date: "2026-08-20",
				startTime: "09:00",
				guests: 1,
			},
		);
		const bookingId2 = await t.mutation(
			internal.public_booking.internalCreate,
			{
				organizationId: orgId,
				tourId,
				customerName: "Bob Updated",
				customerEmail: "bob@example.com",
				date: "2026-08-21",
				startTime: "09:00",
				guests: 3,
			},
		);
		const b1 = await t.run(async (ctx) => ctx.db.get(bookingId1));
		const b2 = await t.run(async (ctx) => ctx.db.get(bookingId2));
		expect(b1?.customerId).toBe(b2?.customerId);
	});

	it("rejects inactive tours", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_c";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId, 10, false),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "Carol",
				customerEmail: "carol@example.com",
				date: "2026-08-22",
				startTime: "09:00",
				guests: 2,
			}),
		).rejects.toThrow(/not active/);
	});

	it("rejects guests > maxGuests", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_d";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId, 5),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "Dan",
				customerEmail: "dan@example.com",
				date: "2026-08-23",
				startTime: "09:00",
				guests: 10,
			}),
		).rejects.toThrow(/maximum of 5/);
	});

	it("rejects when tour belongs to a different org", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, "org_other"),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: "org_pub_e",
				tourId,
				customerName: "Eve",
				customerEmail: "eve@example.com",
				date: "2026-08-24",
				startTime: "09:00",
				guests: 2,
			}),
		).rejects.toThrow(/Tour not found/);
	});

	it("writes audit log with action 'booking.created_public'", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_f";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await t.mutation(internal.public_booking.internalCreate, {
			organizationId: orgId,
			tourId,
			customerName: "Frank",
			customerEmail: "frank@example.com",
			date: "2026-08-25",
			startTime: "09:00",
			guests: 2,
		});
		const auditLogs = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		const created = auditLogs.find(
			(l: { action: string }) => l.action === "booking.created_public",
		);
		expect(created).toBeDefined();
	});

	it("new public customers default to emailConsent: false (matches source model)", async () => {
		// Regression for Phase 7.2 review finding #8:
		// Source's Customer model defaults email_consent=False; we
		// previously set emailConsent=true on new public customers,
		// which is a behavioral change. The public form should
		// collect explicit consent before flipping it on.
		const t = convexTest(schema, modules);
		const orgId = "org_pub_consent";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await t.mutation(internal.public_booking.internalCreate, {
			organizationId: orgId,
			tourId,
			customerName: "Greta",
			customerEmail: "greta@example.com",
			date: "2026-09-10",
			startTime: "11:00",
			guests: 1,
		});
		const customers = await t.run(async (ctx) =>
			ctx.db.query("customers").collect(),
		);
		const greta = customers.find(
			(c: { email: string }) => c.email === "greta@example.com",
		);
		expect(greta).toBeDefined();
		expect(greta?.emailConsent).toBe(false);
		expect(greta?.smsConsent).toBe(false);
	});

	it("rejects guests <= 0", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_zero";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "Hank",
				customerEmail: "hank@example.com",
				date: "2026-09-11",
				startTime: "10:00",
				guests: 0,
			}),
		).rejects.toThrow(/guests must be > 0/);
	});

	it("persists phone and notes on new customer", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_phone";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await t.mutation(internal.public_booking.internalCreate, {
			organizationId: orgId,
			tourId,
			customerName: "Ivy",
			customerEmail: "ivy@example.com",
			customerPhone: "+1-555-0100",
			date: "2026-09-12",
			startTime: "10:00",
			guests: 2,
			notes: "Vegetarian lunch",
		});
		const customers = await t.run(async (ctx) =>
			ctx.db.query("customers").collect(),
		);
		const ivy = customers.find(
			(c: { email: string }) => c.email === "ivy@example.com",
		);
		expect(ivy?.phone).toBe("+1-555-0100");
		expect(ivy?.notes).toBe("Vegetarian lunch");
		const booking = (await t.run(async (ctx) =>
			ctx.db.query("bookings").first(),
		)) as { notes: string };
		expect(booking?.notes).toBe("Vegetarian lunch");
	});

	it("booking has zero totalAmountCents (payment happens later)", async () => {
		// Public bookings are created as confirmed with no money — the
		// payment is captured separately via Stripe. Verify the fields
		// are bigint 0n rather than undefined.
		const t = convexTest(schema, modules);
		const orgId = "org_pub_amounts";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const bookingId = await t.mutation(
			internal.public_booking.internalCreate,
			{
				organizationId: orgId,
				tourId,
				customerName: "Jane",
				customerEmail: "jane@example.com",
				date: "2026-09-13",
				startTime: "10:00",
				guests: 2,
			},
		);
		const booking = (await t.run(async (ctx) =>
			ctx.db.get(bookingId),
		)) as any;
		expect(String(booking.totalAmountCents)).toBe("0");
		expect(String(booking.depositAmountCents)).toBe("0");
		expect(String(booking.balanceDueCents)).toBe("0");
		expect(String(booking.netRevenueCents)).toBe("0");
		expect(booking.paymentMethod).toBe("");
	});

	it("reuses existing customer without overwriting phone/notes", async () => {
		// When the same email re-books, internalCreate should NOT
		// overwrite the existing customer's phone/notes with the
		// new booking's values — only created on first insert.
		const t = convexTest(schema, modules);
		const orgId = "org_pub_reuse";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await t.mutation(internal.public_booking.internalCreate, {
			organizationId: orgId,
			tourId,
			customerName: "Karen",
			customerEmail: "karen@example.com",
			customerPhone: "+1-555-0001",
			notes: "Allergic to nuts",
			date: "2026-09-14",
			startTime: "10:00",
			guests: 1,
		});
		await t.mutation(internal.public_booking.internalCreate, {
			organizationId: orgId,
			tourId,
			customerName: "Karen Updated",
			customerEmail: "karen@example.com",
			customerPhone: "+1-555-9999",
			notes: "Vegetarian",
			date: "2026-09-15",
			startTime: "11:00",
			guests: 1,
		});
		const customers = await t.run(async (ctx) =>
			ctx.db.query("customers").collect(),
		);
		const karen = customers.find(
			(c: { email: string }) => c.email === "karen@example.com",
		);
		expect(karen?.phone).toBe("+1-555-0001");
		expect(karen?.notes).toBe("Allergic to nuts");
	});

	it("schedules 24h + 2h reminder notifications", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_notify";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		// Seed the reminder templates so scheduleForBooking finds them.
		await t.run(async (ctx) => {
			await ctx.db.insert("notificationTemplates", {
				organizationId: orgId,
				name: "24h reminder",
				templateType: "reminder_24h",
				channel: "email",
				emailSubject: "Tour tomorrow",
				emailBodyText: "Reminder for {tourName}",
				emailBodyHtml: "",
				smsBody: "",
				variables: [],
				sendTiming: "24h_before",
				requireConsent: false,
				retryOnFailure: true,
				retryCount: 3,
				isActive: true,
				isDefault: false,
				createdAt: 0,
				updatedAt: 0,
			});
			await ctx.db.insert("notificationTemplates", {
				organizationId: orgId,
				name: "2h reminder",
				templateType: "reminder_2h",
				channel: "email",
				emailSubject: "Tour in 2 hours",
				emailBodyText: "See you soon",
				emailBodyHtml: "",
				smsBody: "",
				variables: [],
				sendTiming: "2h_before",
				requireConsent: false,
				retryOnFailure: true,
				retryCount: 3,
				isActive: true,
				isDefault: false,
				createdAt: 0,
				updatedAt: 0,
			});
		});
		await t.mutation(internal.public_booking.internalCreate, {
			organizationId: orgId,
			tourId,
			customerName: "Liam",
			customerEmail: "liam@example.com",
			// Far enough in the future that both reminders are still
			// scheduled (24h and 2h before now).
			date: "2027-12-31",
			startTime: "10:00",
			guests: 2,
		});
		const notifs = (await t.run(async (ctx) =>
			ctx.db.query("scheduledNotifications").collect(),
		)) as Array<{ templateId: string; sent: boolean }>;
		// We seeded 2 active templates → scheduleForBooking should
		// have queued 2 notifications.
		expect(notifs.length).toBe(2);
		expect(notifs.every((n) => !n.sent)).toBe(true);
	});

	it("audit log includes tour/email/guests in newValues", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_audit";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const bookingId = await t.mutation(
			internal.public_booking.internalCreate,
			{
				organizationId: orgId,
				tourId,
				customerName: "Maya",
				customerEmail: "maya@example.com",
				date: "2026-09-17",
				startTime: "10:00",
				guests: 4,
			},
		);
		const auditLogs = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		const log = auditLogs.find(
			(l: { action: string; resourceId: string }) =>
				l.action === "booking.created_public" &&
				l.resourceId === bookingId,
		) as any;
		expect(log).toBeDefined();
		expect(log.userId).toBe("anonymous");
		expect(log.resourceType).toBe("booking");
		expect(log.newValues.tourId).toBe(tourId);
		expect(log.newValues.customerEmail).toBe("maya@example.com");
		expect(log.newValues.guests).toBe(4);
		expect(log.newValues.source).toBe("public_booking");
	});
});