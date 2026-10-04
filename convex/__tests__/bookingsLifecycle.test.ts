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
import { describe, expect, it, vi } from "vitest";
import schema from "../schema";
import {
	seedBooking,
	seedCustomer,
	seedException,
	seedSchedule,
	seedTour,
} from "./helpers";
import {
	performCancel,
	performComplete,
	performExpire,
} from "../lib/bookingsLifecycle";

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

describe("bookingsLifecycle.performUpdate — guest-count invariants (F-new-booking-update-invariants)", () => {
	async function seedLinked(
		t: ReturnType<typeof convexTest>,
		opts: {
			guests?: number;
			capTotal?: number;
			booked?: number;
			maxGuests?: number;
			date?: string;
			startTime?: string;
		} = {},
	) {
		return t.run(async (ctx) => {
			const guests = opts.guests ?? 2;
			const tourId = await seedTour(ctx, {
				orgId: ORG,
				maxGuests: opts.maxGuests,
			});
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			const scheduleId = await seedSchedule(ctx, {
				orgId: ORG,
				tourId,
				date: opts.date,
				startTime: opts.startTime,
				capacityTotal: opts.capTotal ?? 10,
				capacityBooked: opts.booked ?? guests,
			});
			const bookingId = await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				status: "confirmed",
				guests,
				date: opts.date,
				startTime: opts.startTime,
			});
			await ctx.db.patch(bookingId, { scheduleId });
			const booking = (await ctx.db.get(bookingId))!;
			return { tourId, customerId, scheduleId, bookingId, booking };
		});
	}

	it("rejects zero guests without touching counters", async () => {
		const t = convexTest(schema, modules);
		const w = await seedLinked(t);
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, w.booking, ORG, "user_1", {
					bookingId: w.bookingId,
					guests: 0,
				}),
			).rejects.toThrow("positive integer");
			expect((await ctx.db.get(w.bookingId))!.guests).toBe(2);
			expect((await ctx.db.get(w.scheduleId))!.capacityBooked).toBe(2);
		});
	});

	it("rejects negative guests", async () => {
		const t = convexTest(schema, modules);
		const w = await seedLinked(t);
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, w.booking, ORG, "user_1", {
					bookingId: w.bookingId,
					guests: -1,
				}),
			).rejects.toThrow("positive integer");
			expect((await ctx.db.get(w.bookingId))!.guests).toBe(2);
		});
	});

	it("rejects fractional guests", async () => {
		const t = convexTest(schema, modules);
		const w = await seedLinked(t);
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, w.booking, ORG, "user_1", {
					bookingId: w.bookingId,
					guests: 2.5,
				}),
			).rejects.toThrow("positive integer");
			expect((await ctx.db.get(w.bookingId))!.guests).toBe(2);
		});
	});

	it("rejects guests above the tour maximum (create parity)", async () => {
		const t = convexTest(schema, modules);
		const w = await seedLinked(t, {
			maxGuests: 15,
			capTotal: 50,
			booked: 2,
		});
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, w.booking, ORG, "user_1", {
					bookingId: w.bookingId,
					guests: 16,
				}),
			).rejects.toThrow("Guest count exceeds tour maximum of 15");
			expect((await ctx.db.get(w.bookingId))!.guests).toBe(2);
			expect((await ctx.db.get(w.scheduleId))!.capacityBooked).toBe(2);
		});
	});

	it("allows an increase within capacity with net accounting", async () => {
		const t = convexTest(schema, modules);
		const w = await seedLinked(t, { capTotal: 10, booked: 2 });
		await t.run(async (ctx) => {
			await performUpdate(ctx, w.booking, ORG, "user_1", {
				bookingId: w.bookingId,
				guests: 4,
			});
			expect((await ctx.db.get(w.bookingId))!.guests).toBe(4);
			expect((await ctx.db.get(w.scheduleId))!.capacityBooked).toBe(4);
		});
	});

	it("rejects a same-schedule increase beyond capacity", async () => {
		const t = convexTest(schema, modules);
		const w = await seedLinked(t, { capTotal: 3, booked: 2 });
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, w.booking, ORG, "user_1", {
					bookingId: w.bookingId,
					guests: 4,
				}),
			).rejects.toThrow();
			expect((await ctx.db.get(w.bookingId))!.guests).toBe(2);
			expect((await ctx.db.get(w.scheduleId))!.capacityBooked).toBe(2);
		});
	});
});

describe("bookingsLifecycle.performUpdate — live slot parity on reschedule (F-new-booking-update-invariants)", () => {
	const TARGET = { date: "2027-04-11", startTime: "10:00" };

	async function seedMovable(
		t: ReturnType<typeof convexTest>,
		opts: { guests?: number; capTotal?: number; status?: "confirmed" } = {},
	) {
		return t.run(async (ctx) => {
			const guests = opts.guests ?? 2;
			const tourId = await seedTour(ctx, { orgId: ORG });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			const scheduleId = await seedSchedule(ctx, {
				orgId: ORG,
				tourId,
				capacityTotal: opts.capTotal ?? 10,
				capacityBooked: guests,
			});
			const bookingId = await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				status: "confirmed",
				guests,
			});
			await ctx.db.patch(bookingId, { scheduleId });
			const booking = (await ctx.db.get(bookingId))!;
			return { tourId, customerId, scheduleId, bookingId, booking };
		});
	}

	it("rejects a move onto a removed exception date", async () => {
		const t = convexTest(schema, modules);
		const w = await seedMovable(t);
		await t.run(async (ctx) => {
			await seedException(ctx, {
				orgId: ORG,
				tourId: w.tourId,
				date: TARGET.date,
				exceptionType: "removed",
			});
		});
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, w.booking, ORG, "user_1", {
					bookingId: w.bookingId,
					date: TARGET.date,
					startTime: TARGET.startTime,
				}),
			).rejects.toThrow("not available");
			expect((await ctx.db.get(w.bookingId))!.date).toBe(w.booking.date);
			expect((await ctx.db.get(w.scheduleId))!.capacityBooked).toBe(2);
		});
	});

	it("rejects a move onto a suppressed slot (modified startTime)", async () => {
		const t = convexTest(schema, modules);
		const w = await seedMovable(t);
		await t.run(async (ctx) => {
			await seedException(ctx, {
				orgId: ORG,
				tourId: w.tourId,
				date: TARGET.date,
				exceptionType: "modified",
				startTime: "14:00",
			});
		});
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, w.booking, ORG, "user_1", {
					bookingId: w.bookingId,
					date: TARGET.date,
					startTime: TARGET.startTime,
				}),
			).rejects.toThrow("not available");
			expect((await ctx.db.get(w.scheduleId))!.capacityBooked).toBe(2);
		});
	});

	it("rejects a move beyond the target capacityOverride", async () => {
		const t = convexTest(schema, modules);
		const w = await seedMovable(t);
		const targetId = await t.run(async (ctx) => {
			await seedException(ctx, {
				orgId: ORG,
				tourId: w.tourId,
				date: TARGET.date,
				exceptionType: "modified",
				capacityOverride: 5,
			});
			return seedSchedule(ctx, {
				orgId: ORG,
				tourId: w.tourId,
				date: TARGET.date,
				startTime: TARGET.startTime,
				capacityTotal: 10,
				capacityBooked: 4,
			});
		});
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, w.booking, ORG, "user_1", {
					bookingId: w.bookingId,
					scheduleId: targetId,
				}),
			).rejects.toThrow("Not enough seats");
			// Atomic: the old schedule keeps its seats when the move fails.
			expect((await ctx.db.get(w.scheduleId))!.capacityBooked).toBe(2);
			expect((await ctx.db.get(targetId))!.capacityBooked).toBe(4);
			expect((await ctx.db.get(w.bookingId))!.scheduleId).toBe(w.scheduleId);
		});
	});

	it("allows an increase within the override when self seats cover", async () => {
		const t = convexTest(schema, modules);
		const w = await seedLinkedOverride(t);
		await t.run(async (ctx) => {
			await performUpdate(ctx, w.booking, ORG, "user_1", {
				bookingId: w.bookingId,
				guests: 6,
			});
			expect((await ctx.db.get(w.bookingId))!.guests).toBe(6);
			expect((await ctx.db.get(w.scheduleId))!.capacityBooked).toBe(8);
		});

		async function seedLinkedOverride(t: ReturnType<typeof convexTest>) {
			return t.run(async (ctx) => {
				const tourId = await seedTour(ctx, { orgId: ORG });
				const customerId = await seedCustomer(ctx, { orgId: ORG });
				const scheduleId = await seedSchedule(ctx, {
					orgId: ORG,
					tourId,
					capacityTotal: 10,
					capacityBooked: 6,
				});
				const schedule = (await ctx.db.get(scheduleId))!;
				await seedException(ctx, {
					orgId: ORG,
					tourId,
					date: schedule.date,
					exceptionType: "modified",
					capacityOverride: 8,
				});
				const bookingId = await seedBooking(ctx, {
					orgId: ORG,
					tourId,
					customerId,
					status: "confirmed",
					guests: 4,
				});
				await ctx.db.patch(bookingId, { scheduleId });
				const booking = (await ctx.db.get(bookingId))!;
				return { tourId, customerId, scheduleId, bookingId, booking };
			});
		}
	});

	it("rejects a move onto a cancelled schedule without touching the old counter", async () => {
		const t = convexTest(schema, modules);
		const w = await seedMovable(t);
		const targetId = await t.run(async (ctx) => {
			const id = await seedSchedule(ctx, {
				orgId: ORG,
				tourId: w.tourId,
				date: TARGET.date,
				startTime: TARGET.startTime,
				capacityTotal: 10,
				capacityBooked: 0,
			});
			await ctx.db.patch(id, { status: "cancelled" });
			return id;
		});
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, w.booking, ORG, "user_1", {
					bookingId: w.bookingId,
					scheduleId: targetId,
				}),
			).rejects.toThrow("cancelled");
			expect((await ctx.db.get(w.scheduleId))!.capacityBooked).toBe(2);
			expect((await ctx.db.get(w.bookingId))!.scheduleId).toBe(w.scheduleId);
		});
	});

	it("failed moves are atomic: a full target leaves the old schedule untouched", async () => {
		const t = convexTest(schema, modules);
		const w = await seedMovable(t);
		const targetId = await t.run(async (ctx) =>
			seedSchedule(ctx, {
				orgId: ORG,
				tourId: w.tourId,
				date: TARGET.date,
				startTime: TARGET.startTime,
				capacityTotal: 3,
				capacityBooked: 3,
			}),
		);
		await t.run(async (ctx) => {
			await expect(
				performUpdate(ctx, w.booking, ORG, "user_1", {
					bookingId: w.bookingId,
					scheduleId: targetId,
				}),
			).rejects.toThrow();
			expect((await ctx.db.get(w.scheduleId))!.capacityBooked).toBe(2);
			expect((await ctx.db.get(targetId))!.capacityBooked).toBe(3);
			expect((await ctx.db.get(w.bookingId))!.scheduleId).toBe(w.scheduleId);
		});
	});
});

describe("bookingsLifecycle.releaseBookingCapacity — only claimed capacity (F-new-unlinked-booking-capacity-release)", () => {
	// The booking stays UNLINKED (free-time request, no scheduleId):
	// the date fallback finds the same-slot schedule, and the guard
	// decides by creation order.
	async function seedUnlinked(
		t: ReturnType<typeof convexTest>,
		status: "confirmed" | "pending",
		order: "schedule-later" | "schedule-earlier",
	) {
		vi.useFakeTimers();
		try {
			const world = await t.run(async (ctx) => {
				const tourId = await seedTour(ctx, { orgId: ORG });
				const customerId = await seedCustomer(ctx, { orgId: ORG });
				return { tourId, customerId };
			});
			const seedBookingRow = () =>
				t.run(async (ctx) =>
					seedBooking(ctx, {
						orgId: ORG,
						tourId: world.tourId,
						customerId: world.customerId,
						status,
						guests: 2,
					}),
				);
			const seedScheduleRow = (booked: number) =>
				t.run(async (ctx) =>
					seedSchedule(ctx, {
						orgId: ORG,
						tourId: world.tourId,
						capacityTotal: 10,
						capacityBooked: booked,
					}),
				);
			let bookingId;
			let scheduleId;
			if (order === "schedule-later") {
				vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
				bookingId = await seedBookingRow();
				vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
				scheduleId = await seedScheduleRow(3);
			} else {
				vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
				scheduleId = await seedScheduleRow(2);
				vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
				bookingId = await seedBookingRow();
			}
			const booking = await t.run(
				async (ctx) => (await ctx.db.get(bookingId))!,
			);
			return { ...world, bookingId, scheduleId, booking };
		} finally {
			vi.useRealTimers();
		}
	}

	it("cancel of an unlinked booking leaves a later same-slot schedule untouched", async () => {
		const t = convexTest(schema, modules);
		const w = await seedUnlinked(t, "confirmed", "schedule-later");
		await t.run(async (ctx) => {
			await performCancel(ctx, w.booking, undefined, "user_1");
			expect((await ctx.db.get(w.bookingId))!.status).toBe("cancelled");
			expect((await ctx.db.get(w.scheduleId))!.capacityBooked).toBe(3);
		});
	});

	it("cancel of an unlinked booking still restores an earlier schedule (legacy compat)", async () => {
		const t = convexTest(schema, modules);
		const w = await seedUnlinked(t, "confirmed", "schedule-earlier");
		await t.run(async (ctx) => {
			await performCancel(ctx, w.booking, undefined, "user_1");
			expect((await ctx.db.get(w.scheduleId))!.capacityBooked).toBe(0);
		});
	});

	it("expiry of an unlinked booking leaves a later same-slot schedule untouched", async () => {
		const t = convexTest(schema, modules);
		const w = await seedUnlinked(t, "pending", "schedule-later");
		await t.run(async (ctx) => {
			await performExpire(ctx, w.booking, "user_1");
			expect((await ctx.db.get(w.bookingId))!.status).toBe("expired");
			expect((await ctx.db.get(w.scheduleId))!.capacityBooked).toBe(3);
		});
	});
});
