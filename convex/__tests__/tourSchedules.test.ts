import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";
import { seedTour } from "./helpers";

const modules = import.meta.glob("../**/*.{ts,tsx}");

describe("tour schedules", () => {
	it("create: stores schedule with audit log", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ts1";
		const tourId = await t.run((ctx) => seedTour(ctx, { orgId }));
		const id = await t.mutation(internal.tourSchedules.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			date: "2026-09-01",
			startTime: "09:00",
			endTime: "11:00",
			capacityTotal: 10,
		});
		expect(id).toBeDefined();
		const logs = (await t.run((ctx) =>
			ctx.db.query("auditLogs").collect(),
		)) as any;
		expect(logs[0]?.action).toBe("tour_schedule.created");
	});

	it("create: rejects capacity <= 0", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ts2";
		const tourId = await t.run((ctx) => seedTour(ctx, { orgId }));
		await expect(
			t.mutation(internal.tourSchedules.internalCreate, {
				organizationId: orgId,
				userId: "user-1",
				tourId,
				date: "2026-09-01",
				startTime: "09:00",
				endTime: "11:00",
				capacityTotal: 0,
			}),
		).rejects.toThrow(/Capacity must be positive/);
	});

	it("create: rejects cross-org tour", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run((ctx) => seedTour(ctx, { orgId: "org_ts3a" }));
		await expect(
			t.mutation(internal.tourSchedules.internalCreate, {
				organizationId: "org_ts3b",
				userId: "user-1",
				tourId,
				date: "2026-09-01",
				startTime: "09:00",
				endTime: "11:00",
				capacityTotal: 10,
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("incrementBooked: increases count and flips to full at capacity", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ts4";
		const tourId = await t.run((ctx) => seedTour(ctx, { orgId }));
		const id = await t.mutation(internal.tourSchedules.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			date: "2026-09-01",
			startTime: "09:00",
			endTime: "11:00",
			capacityTotal: 10,
		});
		await t.mutation(internal.tourSchedules.incrementBooked, {
			organizationId: orgId,
			scheduleId: id,
			guests: 6,
		});
		let s = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(s?.capacityBooked).toBe(6);
		expect(s?.status).toBe("available");
		await t.mutation(internal.tourSchedules.incrementBooked, {
			organizationId: orgId,
			scheduleId: id,
			guests: 4,
		});
		s = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(s?.capacityBooked).toBe(10);
		expect(s?.status).toBe("full");
	});

	it("incrementBooked: rejects over-capacity", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ts5";
		const tourId = await t.run((ctx) => seedTour(ctx, { orgId }));
		const id = await t.mutation(internal.tourSchedules.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			date: "2026-09-01",
			startTime: "09:00",
			endTime: "11:00",
			capacityTotal: 5,
		});
		await expect(
			t.mutation(internal.tourSchedules.incrementBooked, {
				organizationId: orgId,
				scheduleId: id,
				guests: 6,
			}),
		).rejects.toThrow(/over capacity/);
	});

	it("update: rejects capacity below current bookings", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ts6";
		const tourId = await t.run((ctx) => seedTour(ctx, { orgId }));
		const id = await t.mutation(internal.tourSchedules.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			date: "2026-09-01",
			startTime: "09:00",
			endTime: "11:00",
			capacityTotal: 10,
		});
		await t.mutation(internal.tourSchedules.incrementBooked, {
			organizationId: orgId,
			scheduleId: id,
			guests: 8,
		});
		await expect(
			t.mutation(internal.tourSchedules.internalUpdate, {
				organizationId: orgId,
				userId: "user-1",
				scheduleId: id,
				capacityTotal: 5,
			}),
		).rejects.toThrow(/below current bookings/);
	});

	it("decrementBooked: decreases count, flips full→available", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ts_decr";
		const tourId = await t.run((ctx) => seedTour(ctx, { orgId }));
		const id = await t.mutation(internal.tourSchedules.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			date: "2026-09-01",
			startTime: "09:00",
			endTime: "11:00",
			capacityTotal: 10,
		});
		// Fill the schedule to flip status to "full".
		await t.mutation(internal.tourSchedules.incrementBooked, {
			organizationId: orgId,
			scheduleId: id,
			guests: 10,
		});
		let s = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(s?.capacityBooked).toBe(10);
		expect(s?.status).toBe("full");
		// Cancel 4 guests.
		await t.mutation(internal.tourSchedules.decrementBooked, {
			organizationId: orgId,
			scheduleId: id,
			guests: 4,
		});
		s = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(s?.capacityBooked).toBe(6);
		expect(s?.status).toBe("available");
		// Clamp at 0 (no negative result).
		await t.mutation(internal.tourSchedules.decrementBooked, {
			organizationId: orgId,
			scheduleId: id,
			guests: 100,
		});
		s = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(s?.capacityBooked).toBe(0);
	});

	it("decrementBooked: rejects cross-org", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ts_decr_x";
		const tourId = await t.run((ctx) => seedTour(ctx, { orgId }));
		const id = await t.mutation(internal.tourSchedules.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			date: "2026-09-01",
			startTime: "09:00",
			endTime: "11:00",
			capacityTotal: 10,
		});
		await expect(
			t.mutation(internal.tourSchedules.decrementBooked, {
				organizationId: "org_other",
				scheduleId: id,
				guests: 1,
			}),
		).rejects.toThrow(/wrong organization/);
	});

	it("remove: blocks delete when bookings exist", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ts7";
		const tourId = await t.run((ctx) => seedTour(ctx, { orgId }));
		const id = await t.mutation(internal.tourSchedules.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			date: "2026-09-01",
			startTime: "09:00",
			endTime: "11:00",
			capacityTotal: 10,
		});
		await t.mutation(internal.tourSchedules.incrementBooked, {
			organizationId: orgId,
			scheduleId: id,
			guests: 2,
		});
		await expect(
			t.mutation(internal.tourSchedules.internalRemove, {
				organizationId: orgId,
				userId: "user-1",
				scheduleId: id,
			}),
		).rejects.toThrow(/existing bookings/);
	});

	it("remove: deletes empty schedule", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ts8";
		const tourId = await t.run((ctx) => seedTour(ctx, { orgId }));
		const id = await t.mutation(internal.tourSchedules.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			date: "2026-09-01",
			startTime: "09:00",
			endTime: "11:00",
			capacityTotal: 10,
		});
		await t.mutation(internal.tourSchedules.internalRemove, {
			organizationId: orgId,
			userId: "user-1",
			scheduleId: id,
		});
		const s = await t.run((ctx) => ctx.db.get(id));
		expect(s).toBeNull();
	});
});
