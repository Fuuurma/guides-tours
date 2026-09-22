// Tests for convex/lib/bookingsLifecycle — the shared mutation core
// behind the public + internal booking mutations (god-module
// decomposition, slice 1).
//
// First batch: performCancel + performComplete — the terminal-state
// guards, cancel-reason cap, notes append, capacity restore,
// nextBookingDate clearing, scheduledNotification cancellation, the
// customer-stats bump + VIP flip on completion, and audit rows.
// (F19 coverage gap: the module had no direct tests. performUpdate /
// performConfirm are the next batch.)

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { seedBooking, seedCustomer, seedSchedule, seedTour } from "./helpers";
import { performCancel, performComplete } from "../lib/bookingsLifecycle";

const modules = import.meta.glob("../**/*.{ts,tsx}");

const ORG = "org_test";

async function seedWorld(
	t: ReturnType<typeof convexTest>,
	opts: { status: "pending" | "confirmed" | "checked_in" | "completed" | "cancelled" },
) {
	return t.run(async (ctx) => {
		const tourId = await seedTour(ctx, { orgId: ORG });
		const customerId = await seedCustomer(ctx, { orgId: ORG });
		const bookingId = await seedBooking(ctx, {
			orgId: ORG,
			tourId,
			customerId,
			status: opts.status,
		});
		const booking = (await ctx.db.get(bookingId))!;
		return { tourId, customerId, bookingId, booking };
	});
}

describe("bookingsLifecycle.performCancel — terminal-state guards", () => {
	it("refuses an already-cancelled booking", async () => {
		const t = convexTest(schema, modules);
		const { booking } = await seedWorld(t, { status: "cancelled" });
		await t.run(async (ctx) => {
			await expect(
				performCancel(ctx, booking, undefined, "user_1"),
			).rejects.toThrow("Already cancelled");
		});
	});

	it("refuses a completed booking", async () => {
		const t = convexTest(schema, modules);
		const { booking } = await seedWorld(t, { status: "completed" });
		await t.run(async (ctx) => {
			await expect(
				performCancel(ctx, booking, undefined, "user_1"),
			).rejects.toThrow("Cannot cancel a completed booking");
		});
	});

	it("refuses a checked-in booking", async () => {
		const t = convexTest(schema, modules);
		const { booking } = await seedWorld(t, { status: "checked_in" });
		await t.run(async (ctx) => {
			await expect(
				performCancel(ctx, booking, undefined, "user_1"),
			).rejects.toThrow("Cannot cancel a checked-in booking; complete it first");
		});
	});

	it("caps the cancel reason at 500 chars", async () => {
		const t = convexTest(schema, modules);
		const { booking } = await seedWorld(t, { status: "confirmed" });
		await t.run(async (ctx) => {
			await expect(
				performCancel(ctx, booking, "x".repeat(501), "user_1"),
			).rejects.toThrow("Cancel reason is too long");
		});
	});
});

describe("bookingsLifecycle.performCancel — cancel effects", () => {
	it("flips status, appends the reason to notes, and audits", async () => {
		const t = convexTest(schema, modules);
		const { bookingId } = await seedWorld(t, { status: "confirmed" });
		await t.run(async (ctx) => {
			await ctx.db.patch(bookingId, { notes: "window seat" });
			const booking = (await ctx.db.get(bookingId))!;
			await performCancel(ctx, booking, "guest sick", "user_1");
		});
		const row = await t.run((ctx) => ctx.db.get(bookingId));
		expect(row?.status).toBe("cancelled");
		expect(row?.notes).toBe("window seat\n[CANCELLED] guest sick");
		expect(row?.updatedAt).toBeGreaterThan(0);

		const audits = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		expect(audits.some((a) => a.action === "booking.cancelled")).toBe(true);
	});

	it("restores schedule capacity via the explicit scheduleId", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			const scheduleId = await seedSchedule(ctx, {
				orgId: ORG,
				tourId,
				capacityBooked: 4,
			});
			const bookingId = await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				guests: 3,
			});
			await ctx.db.patch(bookingId, { scheduleId });
			const booking = (await ctx.db.get(bookingId))!;
			return { scheduleId, booking };
		});
		await t.run(async (ctx) => {
			await performCancel(ctx, ids.booking, undefined, "user_1");
		});
		const schedule = await t.run((ctx) => ctx.db.get(ids.scheduleId));
		expect(schedule?.capacityBooked).toBe(1);
	});

	it("clears the customer's nextBookingDate when it pointed here", async () => {
		const t = convexTest(schema, modules);
		const world = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			const bookingId = await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				date: "2026-07-15",
			});
			await ctx.db.patch(customerId, { nextBookingDate: "2026-07-15" });
			const booking = (await ctx.db.get(bookingId))!;
			return { customerId, booking };
		});
		await t.run(async (ctx) => {
			await performCancel(ctx, world.booking, undefined, "user_1");
		});
		const customer = await t.run((ctx) => ctx.db.get(world.customerId));
		expect(customer?.nextBookingDate).toBeUndefined();
	});

	it("marks pending scheduledNotifications sent with processedAt", async () => {
		const t = convexTest(schema, modules);
		const world = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			const bookingId = await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
			});
			const templateId = await ctx.db.insert("notificationTemplates", {
				organizationId: ORG,
				name: "reminder",
				templateType: "reminder_24h",
				channel: "email",
				isActive: true,
				isDefault: false,
				emailSubject: "",
				emailBodyText: "",
				emailBodyHtml: "",
				smsBody: "",
				variables: [],
				sendTiming: "24h_before",
				requireConsent: false,
				retryOnFailure: false,
				retryCount: 0,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			const notificationId = await ctx.db.insert("scheduledNotifications", {
				organizationId: ORG,
				bookingId,
				templateId,
				scheduledFor: Date.now() + 86_400_000,
				sent: false,
				retryCount: 0,
				maxRetries: 3,
				createdAt: Date.now(),
			});
			const booking = (await ctx.db.get(bookingId))!;
			return { notificationId, booking };
		});
		await t.run(async (ctx) => {
			await performCancel(ctx, world.booking, undefined, "user_1");
		});
		const notification = await t.run((ctx) =>
			ctx.db.get(world.notificationId),
		);
		expect(notification?.sent).toBe(true);
		expect(notification?.processedAt).toBeGreaterThan(0);
	});
});

describe("bookingsLifecycle.performComplete", () => {
	it("refuses completed, cancelled, and never-checked-in bookings", async () => {
		const t = convexTest(schema, modules);
		for (const status of [
			"completed",
			"cancelled",
			"confirmed",
		] as const) {
			const { booking } = await seedWorld(t, { status });
			await t.run(async (ctx) => {
				await expect(
					performComplete(ctx, booking, "user_1"),
				).rejects.toThrow();
			});
		}
	});

	it("completes a checked-in booking and bumps customer stats", async () => {
		const t = convexTest(schema, modules);
		const world = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			const bookingId = await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				status: "checked_in",
				totalAmountCents: 12_500n,
			});
			await ctx.db.patch(bookingId, { checkedInAt: Date.now() - 1000 });
			const booking = (await ctx.db.get(bookingId))!;
			return { customerId, booking };
		});
		await t.run(async (ctx) => {
			await performComplete(ctx, world.booking, "user_1");
		});
		const row = await t.run((ctx) => ctx.db.get(world.booking._id));
		expect(row?.status).toBe("completed");
		expect(row?.completedAt).toBeGreaterThan(0);
		const customer = await t.run((ctx) => ctx.db.get(world.customerId));
		expect(customer?.totalVisits).toBe(1);
		expect(customer?.totalRevenueCents).toBe(12_500n);
		expect(customer?.loyaltyPoints).toBe(10);
		expect(customer?.vipStatus).toBe(false);
	});

	it("flips vipStatus at the 5-visit threshold", async () => {
		const t = convexTest(schema, modules);
		const world = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			const bookingId = await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				status: "checked_in",
			});
			await ctx.db.patch(bookingId, { checkedInAt: Date.now() - 1000 });
			// 4 prior visits — this completion is the 5th.
			await ctx.db.patch(customerId, { totalVisits: 4 });
			const booking = (await ctx.db.get(bookingId))!;
			return { customerId, booking };
		});
		await t.run(async (ctx) => {
			await performComplete(ctx, world.booking, "user_1");
		});
		const customer = await t.run((ctx) => ctx.db.get(world.customerId));
		expect(customer?.totalVisits).toBe(5);
		expect(customer?.vipStatus).toBe(true);

		const audits = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		expect(audits.some((a) => a.action === "booking.completed")).toBe(true);
	});
});

// ---- Batch 2: performUpdate + performConfirm ----

import {
	findTargetSchedule,
	performConfirm,
	performUpdate,
} from "../lib/bookingsLifecycle";

const FUTURE = "2026-12-20";

describe("bookingsLifecycle.performUpdate — guards", () => {
	it("refuses cancelled and completed bookings", async () => {
		const t = convexTest(schema, modules);
		for (const status of ["cancelled", "completed"] as const) {
			const { booking } = await seedWorld(t, { status });
			await t.run(async (ctx) => {
				await expect(
					performUpdate(ctx, booking, ORG, "user_1", {
						bookingId: booking._id,
						notes: "nope",
					}),
				).rejects.toThrow(`Cannot modify a ${status} booking`);
			});
		}
	});

	it("refuses rescheduling a checked-in booking", async () => {
		const t = convexTest(schema, modules);
		const { booking } = await seedWorld(t, { status: "checked_in" });
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, booking, ORG, "user_1", {
					bookingId: booking._id,
					date: FUTURE,
				}),
			).rejects.toThrow("Cannot reschedule a checked-in booking");
		});
	});

	it("refuses moving a booking into the past", async () => {
		const t = convexTest(schema, modules);
		const { booking } = await seedWorld(t, { status: "confirmed" });
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, booking, ORG, "user_1", {
					bookingId: booking._id,
					date: "2020-01-01",
					startTime: "09:00",
				}),
			).rejects.toThrow("Cannot move a booking into the past");
		});
	});
});

describe("bookingsLifecycle.performUpdate — effects", () => {
	it("patches whitelisted fields and flattens changes into the audit row", async () => {
		const t = convexTest(schema, modules);
		const { bookingId } = await seedWorld(t, { status: "confirmed" });
		await t.run(async (ctx) => {
			await performUpdate(ctx, (await ctx.db.get(bookingId))!, ORG, "user_1", {
				bookingId,
				notes: "vegan",
				guests: 4,
			});
		});
		const row = await t.run((ctx) => ctx.db.get(bookingId));
		expect(row?.notes).toBe("vegan");
		expect(row?.guests).toBe(4);
		const audits = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		const update = audits.find((a) => a.action === "booking.updated");
		expect(update).toBeDefined();
		expect(update?.newValues).toMatchObject({ notes: "vegan", guests: 4 });
	});

	it("transfers capacity when moving to another schedule", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			const scheduleA = await seedSchedule(ctx, {
				orgId: ORG,
				tourId,
				date: FUTURE,
				startTime: "09:00",
				capacityBooked: 2,
			});
			const scheduleB = await seedSchedule(ctx, {
				orgId: ORG,
				tourId,
				date: FUTURE,
				startTime: "14:00",
				capacityBooked: 0,
			});
			const bookingId = await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				guests: 2,
			});
			await ctx.db.patch(bookingId, { scheduleId: scheduleA });
			const booking = (await ctx.db.get(bookingId))!;
			return { scheduleA, scheduleB, booking };
		});
		await t.run(async (ctx) => {
			await performUpdate(ctx, ids.booking, ORG, "user_1", {
				bookingId: ids.booking._id,
				scheduleId: ids.scheduleB,
			});
		});
		const a = await t.run((ctx) => ctx.db.get(ids.scheduleA));
		const b = await t.run((ctx) => ctx.db.get(ids.scheduleB));
		expect(a?.capacityBooked).toBe(0);
		expect(b?.capacityBooked).toBe(2);
		const row = await t.run((ctx) => ctx.db.get(ids.booking._id));
		expect(row?.scheduleId).toBe(ids.scheduleB);
		expect(row?.startTime).toBe("14:00");
	});

	it("adjusts the same schedule when only guests change", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			const scheduleId = await seedSchedule(ctx, {
				orgId: ORG,
				tourId,
				date: FUTURE,
				capacityBooked: 2,
			});
			const bookingId = await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				guests: 2,
			});
			await ctx.db.patch(bookingId, { scheduleId });
			const booking = (await ctx.db.get(bookingId))!;
			return { scheduleId, booking };
		});
		await t.run(async (ctx) => {
			await performUpdate(ctx, ids.booking, ORG, "user_1", {
				bookingId: ids.booking._id,
				guests: 5,
			});
		});
		const schedule = await t.run((ctx) => ctx.db.get(ids.scheduleId));
		expect(schedule?.capacityBooked).toBe(5);
	});

	it("recomputes balanceDue and netRevenue on a total update", async () => {
		const t = convexTest(schema, modules);
		const world = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			const bookingId = await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				totalAmountCents: 10_000n,
				depositAmountCents: 2_000n,
			});
			const booking = (await ctx.db.get(bookingId))!;
			return { booking };
		});
		await t.run(async (ctx) => {
			await performUpdate(ctx, world.booking, ORG, "user_1", {
				bookingId: world.booking._id,
				totalAmountCents: 20_000n,
			});
		});
		const row = await t.run((ctx) => ctx.db.get(world.booking._id));
		expect(row?.totalAmountCents).toBe(20_000n);
		expect(row?.balanceDueCents).toBe(18_000n);
		expect(row?.netRevenueCents).toBe(20_000n);
	});
});

describe("bookingsLifecycle.performConfirm + findTargetSchedule", () => {
	it("confirm flips pending → confirmed and audits", async () => {
		const t = convexTest(schema, modules);
		const { bookingId } = await seedWorld(t, { status: "pending" });
		await t.run(async (ctx) => {
			await performConfirm(ctx, (await ctx.db.get(bookingId))!, "user_1");
		});
		const row = await t.run((ctx) => ctx.db.get(bookingId));
		expect(row?.status).toBe("confirmed");
		const audits = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		expect(audits.some((a) => a.action === "booking.confirmed")).toBe(true);
	});

	it("findTargetSchedule rejects foreign/tour-mismatched schedule ids", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const otherTour = await seedTour(ctx, { orgId: ORG, name: "Other" });
			const schedule = await seedSchedule(ctx, {
				orgId: ORG,
				tourId: otherTour,
			});
			return { tourId, schedule };
		});
		await t.run(async (ctx) => {
			await expect(
				findTargetSchedule(ctx, {
					organizationId: ORG,
					tourId: ids.tourId,
					date: FUTURE,
					startTime: "09:00",
					scheduleId: ids.schedule,
				}),
			).rejects.toThrow("Schedule does not belong to the booking's tour");
		});
	});
});
