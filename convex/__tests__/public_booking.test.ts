// Tests for the public booking flow.
//
// We test the internalCreate mutation directly. The httpAction
// wrapper is covered by public_booking_http.test.ts (routing +
// body validation) and public_booking_http_cross_tenant.test.ts
// (cross-tenant hostile tourId / scheduleId at the httpAction
// boundary, which now runs end-to-end via the Better Auth
// component mock at test-utils/betterAuthMock).

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import schema from "../schema";
import { internal } from "../_generated/api";
import { seedBlackout, seedTour as sharedSeedTour } from "./helpers";

const modules = import.meta.glob("../**/*.{ts,tsx}");

type TestCtx = GenericMutationCtx<DataModel> & {
	storage: { getUrl: (id: string) => Promise<string | null> };
};

// Local wrapper that preserves the historical positional
// signature `(ctx, orgId, maxGuests, isActive)` so the 23
// existing call sites in this file don't need to change. The
// underlying `seedTour` lives in `convex/__tests__/helpers.ts`
// and is the single source of truth for tour seed shape.
async function seedTour(
	ctx: TestCtx,
	orgId: string,
	maxGuests = 15,
	isActive = true,
): Promise<Id<"tours">> {
	return await sharedSeedTour(
		ctx as unknown as Parameters<typeof sharedSeedTour>[0],
		{ orgId, maxGuests, isActive, name: "Old Town Walk" },
	);
}

describe("convex/public_booking — internalCreate mutation", () => {
	it("creates a pending booking request for a valid tour in the org", async () => {
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
		expect(booking?.status).toBe("pending");
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

	it("rejects name over the shared MAX_NAME_LEN (defense in depth)", async () => {
		// The FE caps customerName via maxLength, but the public
		// endpoint is reachable from anyone — if the FE is bypassed
		// (curl, replay, etc.) we must still reject absurd payloads.
		const t = convexTest(schema, modules);
		const orgId = "org_pub_e_len";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "x".repeat(101),
				customerEmail: "toolong@example.com",
				date: "2026-08-25",
				startTime: "09:00",
				guests: 1,
			}),
		).rejects.toThrow(/Name is too long/);
	});

	it("rejects notes over MAX_NOTES_LEN", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_notes";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "Eve",
				customerEmail: "notes@example.com",
				date: "2026-08-26",
				startTime: "09:00",
				guests: 1,
				notes: "n".repeat(1001),
			}),
		).rejects.toThrow(/Notes are too long/);
	});

	it("rejects phone over MAX_PHONE_LEN", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_phone";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "Eve",
				customerEmail: "phone@example.com",
				date: "2026-08-27",
				startTime: "09:00",
				guests: 1,
				customerPhone: "5".repeat(31),
			}),
		).rejects.toThrow(/Phone is too long/);
	});

	it("rejects overlong email addresses (MAX_EMAIL_LEN)", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_longemail";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const longLocal = "a".repeat(255);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "Eve",
				customerEmail: `${longLocal}@x.com`,
				date: "2026-08-28",
				startTime: "09:00",
				guests: 1,
			}),
		).rejects.toThrow(/Invalid email address/);
	});

	it("rejects empty customerName (must be at least 2 chars)", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_noname";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "",
				customerEmail: "noname@example.com",
				date: "2026-08-29",
				startTime: "09:00",
				guests: 1,
			}),
		).rejects.toThrow(/at least 2 characters/);
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

	it("rejects past dates", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_past";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "Ivy",
				customerEmail: "ivy@example.com",
				// 2020 is solidly in the past
				date: "2020-01-15",
				startTime: "10:00",
				guests: 1,
			}),
		).rejects.toThrow(/past/);
	});

	it("rejects malformed date/time strings", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_bad";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "Jake",
				customerEmail: "jake@example.com",
				date: "not-a-date",
				startTime: "10:00",
				guests: 1,
			}),
		).rejects.toThrow(/Invalid date/);
	});

	it("rejects bookings inside the bookingCutoffHours window", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_cutoff";
		// Seed a tour with a 48h cutoff
		const tourId = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			return await c.db.insert("tours", {
				organizationId: orgId,
				name: "Tomorrow tour",
				description: "",
				durationHours: 2,
				isActive: true,
				recurrenceType: "none",
				recurrenceDaysOfWeek: [],
				capacity: 10,
				bufferMinutes: 15,
				minGuests: 1,
				maxGuests: 10,
				bookingCutoffHours: 48, // 48h cutoff
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
		});
		// Tomorrow at 10am = ~24h from now, inside the 48h cutoff
		const tomorrow = new Date(Date.now() + 24 * 3_600_000)
			.toISOString()
			.slice(0, 10);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "Kira",
				customerEmail: "kira@example.com",
				date: tomorrow,
				startTime: "10:00",
				guests: 1,
			}),
		).rejects.toThrow(/at least 48h/);
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
		// Public bookings begin as pending requests with no money — the
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
		const bookingId = await t.mutation(internal.public_booking.internalCreate, {
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
		await t.mutation(internal.bookings.internalConfirm, { bookingId });
		const notifs = (await t.run(async (ctx) =>
			ctx.db.query("scheduledNotifications").collect(),
		)) as Array<{ templateId: string; sent: boolean }>;
		// Confirmation queues the 2 active reminder templates.
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

	it("rejects booking when the date is blacked out by the operator", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_blackout";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		// Mark 2026-12-25 as blacked out (single-day range).
		await t.run(async (ctx) =>
			seedBlackout(ctx as unknown as TestCtx, {
				orgId,
				tourId,
				startDate: "2026-12-25",
				endDate: "2026-12-25",
				reason: "Closed for Christmas",
			}),
		);
		// A different date should still book OK.
		await t.mutation(internal.public_booking.internalCreate, {
			organizationId: orgId,
			tourId,
			customerName: "Bob",
			customerEmail: "bob@example.com",
			date: "2026-12-26",
			startTime: "10:00",
			guests: 2,
		});
		// The blacked-out date must reject.
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "Alice",
				customerEmail: "alice@example.com",
				date: "2026-12-25",
				startTime: "10:00",
				guests: 2,
			}),
		).rejects.toThrow(/not available/i);
		// Only the non-blacked-out booking should be on record.
		const rows = await t.run(async (ctx) =>
			ctx.db.query("bookings").collect(),
		);
		expect(rows.length).toBe(1);
	});

	it("rejects booking when the date falls inside a multi-day blackout range", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_blackout_range";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		// Blackout 2026-12-24 through 2026-12-26 (3 days).
		await t.run(async (ctx) =>
			seedBlackout(ctx as unknown as TestCtx, {
				orgId,
				tourId,
				startDate: "2026-12-24",
				endDate: "2026-12-26",
				reason: "Holiday closure",
			}),
		);
		// First day of the range — reject.
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "Eve",
				customerEmail: "eve@example.com",
				date: "2026-12-24",
				startTime: "10:00",
				guests: 1,
			}),
		).rejects.toThrow(/not available/i);
		// Last day of the range — also reject.
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "Frank",
				customerEmail: "frank@example.com",
				date: "2026-12-26",
				startTime: "10:00",
				guests: 1,
			}),
		).rejects.toThrow(/not available/i);
	});
});
describe("convex/public_booking — schedule capacity", () => {
	async function seedSchedule(
		ctx: TestCtx,
		orgId: string,
		tourId: Id<"tours">,
		capacityTotal: number,
		date = "2026-09-10",
		startTime = "10:00",
	): Promise<Id<"tourSchedules">> {
		return await ctx.db.insert("tourSchedules", {
			organizationId: orgId,
			tourId,
			date,
			startTime,
			endTime: "12:00",
			capacityTotal,
			capacityBooked: 0,
			status: "available",
			notes: "",
			createdAt: 0,
			updatedAt: 0,
		});
	}

	it("attaches scheduleId and increments capacityBooked", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_cap_a";
		const { tourId, scheduleId } = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			const tourId = await seedTour(c, orgId, 20);
			const scheduleId = await seedSchedule(c, orgId, tourId, 10);
			return { tourId, scheduleId };
		});

		const bookingId = await t.mutation(
			internal.public_booking.internalCreate,
			{
				organizationId: orgId,
				tourId,
				scheduleId,
				customerName: "Cap Alice",
				customerEmail: "cap-alice@example.com",
				date: "2026-09-10",
				startTime: "10:00",
				guests: 3,
			},
		);

		const booking = await t.run(async (ctx) => ctx.db.get(bookingId));
		expect(booking?.scheduleId).toBe(scheduleId);
		expect(booking?.guests).toBe(3);

		const schedule = await t.run(async (ctx) => ctx.db.get(scheduleId));
		expect(schedule?.capacityBooked).toBe(3);
	});

	it("rejects when schedule is over capacity", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_cap_b";
		const { tourId, scheduleId } = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			const tourId = await seedTour(c, orgId, 20);
			const scheduleId = await seedSchedule(c, orgId, tourId, 4);
			await c.db.patch(scheduleId, { capacityBooked: 3 });
			return { tourId, scheduleId };
		});

		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				scheduleId,
				customerName: "Cap Bob",
				customerEmail: "cap-bob@example.com",
				date: "2026-09-10",
				startTime: "10:00",
				guests: 2,
			}),
		).rejects.toThrow(/over capacity/i);
	});

	it("auto-attaches matching schedule when scheduleId omitted", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_cap_c";
		const { tourId, scheduleId } = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			const tourId = await seedTour(c, orgId, 20);
			const scheduleId = await seedSchedule(c, orgId, tourId, 8);
			return { tourId, scheduleId };
		});

		const bookingId = await t.mutation(
			internal.public_booking.internalCreate,
			{
				organizationId: orgId,
				tourId,
				customerName: "Cap Carol",
				customerEmail: "cap-carol@example.com",
				date: "2026-09-10",
				startTime: "10:00",
				guests: 2,
			},
		);

		const booking = await t.run(async (ctx) => ctx.db.get(bookingId));
		expect(booking?.scheduleId).toBe(scheduleId);
		const schedule = await t.run(async (ctx) => ctx.db.get(scheduleId));
		expect(schedule?.capacityBooked).toBe(2);
	});

	it("stores email/sms consent when provided", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_cap_d";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);

		await t.mutation(internal.public_booking.internalCreate, {
			organizationId: orgId,
			tourId,
			customerName: "Cap Dana",
			customerEmail: "cap-dana@example.com",
			date: "2026-09-12",
			startTime: "11:00",
			guests: 1,
			emailConsent: true,
			smsConsent: true,
		});

		const customer = await t.run(async (ctx) => {
			return await ctx.db
				.query("customers")
				.withIndex("by_org_email", (q) =>
					q.eq("organizationId", orgId).eq("email", "cap-dana@example.com"),
				)
				.unique();
		});
		expect(customer?.emailConsent).toBe(true);
		expect(customer?.smsConsent).toBe(true);
	});
});
