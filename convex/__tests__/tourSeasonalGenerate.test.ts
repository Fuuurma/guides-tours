import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function seedTour(
	ctx: { db: { insert: Function } },
	orgId: string,
	durationHours = 2,
) {
	return await ctx.db.insert("tours", {
		organizationId: orgId,
		name: "City Walk",
		description: "",
		durationHours,
		isActive: true,
		recurrenceType: "none",
		recurrenceDaysOfWeek: [],
		capacity: 12,
		bufferMinutes: 15,
		minGuests: 1,
		maxGuests: 12,
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

describe("tourSeasonalSchedules.internalGenerate", () => {
	it("creates weekday schedules and skips blackout + weekend", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_gen1";

		const tourId = await t.run((ctx) => seedTour(ctx, orgId));

		await t.mutation(internal.tourSeasonalSchedules.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			name: "Summer weekdays",
			startDate: "2026-07-01",
			endDate: "2026-07-07",
			daysOfWeek: [1, 2, 3, 4, 5],
			startTime: "10:00",
			capacityOverride: 10,
		});

		await t.mutation(internal.tourBlackoutDates.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			startDate: "2026-07-03",
			endDate: "2026-07-03",
			reason: "Holiday",
		});

		// 2026-07-01 = Wed, 02=Thu, 03=Fri(blackout), 04=Sat, 05=Sun, 06=Mon, 07=Tue
		const result = await t.mutation(
			internal.tourSeasonalSchedules.internalGenerate,
			{
				organizationId: orgId,
				userId: "user-1",
				tourId,
				dateFrom: "2026-07-01",
				dateTo: "2026-07-07",
			},
		);

		// Wed, Thu, Mon, Tue = 4 created; Fri blackout + Sat/Sun = skipped
		expect(result.created).toBe(4);
		expect(result.skipped).toBeGreaterThan(0);

		const schedules = await t.run(async (ctx) =>
			ctx.db
				.query("tourSchedules")
				.withIndex("by_tour_date", (q) => q.eq("tourId", tourId))
				.collect(),
		);
		expect(schedules).toHaveLength(4);
		expect(schedules.every((s) => s.startTime === "10:00")).toBe(true);
		expect(schedules.some((s) => s.date === "2026-07-03")).toBe(false);

		// Idempotent second run
		const again = await t.mutation(
			internal.tourSeasonalSchedules.internalGenerate,
			{
				organizationId: orgId,
				userId: "user-1",
				tourId,
				dateFrom: "2026-07-01",
				dateTo: "2026-07-07",
			},
		);
		expect(again.created).toBe(0);
	});
});

// ---- GT-AUDIT-04 / hub F598: midnight-wrap schedules are uncancellable ----
//
// endTimeFromDuration wraps modulo 1440 and inserts straight past the CRUD
// validators, so a night tour legitimately ends up with startTime 22:00 /
// endTime 01:00. But internalUpdate checks `endMin <= startMin` and throws
// BEFORE the status branch, so every later update on that row — including the
// dashboard's Cancel departure button — failed on time ordering. Once a
// departure had bookings the operator was stuck.
//
// The codebase already has a canonical answer: absWindow
// (lib/assignmentTime.ts:70-81, covered by assignments.test.ts:954) reads
// `end <= start` as "wraps past midnight", and internalCreate's own comment
// claims wrap is allowed — then rejects it two lines later. These tests pin
// that one convention.

describe("midnight-wrap schedules (GT-AUDIT-04)", () => {
	const ORG = "org_wrap";

	it("generates a night tour with a wrapped endTime", async () => {
		const t = convexTest(schema, modules);
		// 22:00 + 3h = 01:00 next day.
		const tourId = await t.run((ctx) => seedTour(ctx, ORG, 3));

		await t.mutation(internal.tourSeasonalSchedules.internalCreate, {
			organizationId: ORG,
			userId: "user-1",
			tourId,
			name: "Night walks",
			startDate: "2026-07-06",
			endDate: "2026-07-06",
			daysOfWeek: [1],
			startTime: "22:00",
			capacityOverride: 8,
		});

		await t.mutation(internal.tourSeasonalSchedules.internalGenerate, {
			organizationId: ORG,
			userId: "user-1",
			tourId,
			dateFrom: "2026-07-06",
			dateTo: "2026-07-06",
		});

		const rows = await t.run(async (ctx) =>
			ctx.db
				.query("tourSchedules")
				.withIndex("by_tour_date", (q) => q.eq("tourId", tourId))
				.collect(),
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.startTime).toBe("22:00");
		expect(rows[0]?.endTime).toBe("01:00");
	});

	it("can cancel a wrapped departure — the reported dead end", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run((ctx) => seedTour(ctx, ORG, 3));
		await t.mutation(internal.tourSeasonalSchedules.internalCreate, {
			organizationId: ORG,
			userId: "user-1",
			tourId,
			name: "Night walks",
			startDate: "2026-07-13",
			endDate: "2026-07-13",
			daysOfWeek: [1],
			startTime: "22:00",
			capacityOverride: 8,
		});
		await t.mutation(internal.tourSeasonalSchedules.internalGenerate, {
			organizationId: ORG,
			userId: "user-1",
			tourId,
			dateFrom: "2026-07-13",
			dateTo: "2026-07-13",
		});
		const target = await t.run(async (ctx) => {
			const rows = await ctx.db
				.query("tourSchedules")
				.withIndex("by_tour_date", (q) => q.eq("tourId", tourId))
				.collect();
			return rows[0]!._id;
		});

		// Pre-fix this rejects with "endTime must be after startTime".
		await t.mutation(internal.tourSchedules.internalUpdate, {
			organizationId: ORG,
			userId: "user-1",
			scheduleId: target,
			status: "cancelled",
		});

		const after = await t.run((ctx) => ctx.db.get(target));
		expect(after?.status).toBe("cancelled");
	});

	it("accepts a wrapped endTime on direct create, like absWindow does", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run((ctx) => seedTour(ctx, ORG, 3));

		const id = await t.mutation(internal.tourSchedules.internalCreate, {
			organizationId: ORG,
			userId: "user-1",
			tourId,
			date: "2026-07-20",
			startTime: "23:30",
			endTime: "01:30",
			capacityTotal: 8,
		});
		expect(id).toBeTruthy();
	});

	it("still rejects a zero-length window", async () => {
		// The one case absWindow cannot interpret sensibly: end === start
		// would mean a 24-hour tour, so it stays an error.
		const t = convexTest(schema, modules);
		const tourId = await t.run((ctx) => seedTour(ctx, ORG, 3));

		await expect(
			t.mutation(internal.tourSchedules.internalCreate, {
				organizationId: ORG,
				userId: "user-1",
				tourId,
				date: "2026-07-21",
				startTime: "10:00",
				endTime: "10:00",
				capacityTotal: 8,
			}),
		).rejects.toThrow();
	});
});

// ---- GT-AUDIT-08 / hub F608: a >1-year window silently stops at 366 days ----
//
// The loop is bounded by MAX_DAYS = 366 but the mutation validates only
// dateTo >= dateFrom and never compares the requested span to the cap, and
// GenerateDialog imposes no maximum span — so a two-year window is reachable
// from the shipped UI. The return value was `{ created, skipped }`, which for a
// truncated window is indistinguishable from a complete one, and the audit
// entry recorded no truncation either. The operator's toast then reported
// "Created 365, skipped 0" for a year that was never touched, and a whole
// season of departures was silently absent from the public booking page.

describe("generate window truncation (GT-AUDIT-08)", () => {
	const ORG = "org_trunc";
	const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

	it("reports truncation and the date it actually reached", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run((ctx) => seedTour(ctx, ORG, 2));

		await t.mutation(internal.tourSeasonalSchedules.internalCreate, {
			organizationId: ORG,
			userId: "user-1",
			tourId,
			name: "Daily, two years",
			startDate: "2027-01-01",
			endDate: "2028-12-31",
			daysOfWeek: ALL_DAYS,
			startTime: "10:00",
			capacityOverride: 10,
		});

		const result = await t.mutation(
			internal.tourSeasonalSchedules.internalGenerate,
			{
				organizationId: ORG,
				userId: "user-1",
				tourId,
				dateFrom: "2027-01-01",
				dateTo: "2028-12-31",
			},
		);

		// Pre-fix all three of these are undefined.
		expect(result.truncated).toBe(true);
		expect(result.requestedTo).toBe("2028-12-31");
		// Day 1 is 2027-01-01, so the 366th and last processed day is
		// 2028-01-01 — 366 inclusive days later, not 2027-12-31.
		expect(result.processedTo).toBe("2028-01-01");

		// And the truth it was hiding: everything after that day is missing,
		// i.e. the tail of 2028 — almost a whole season — never got schedules.
		const dates = await t.run(async (ctx) =>
			ctx.db
				.query("tourSchedules")
				.withIndex("by_tour_date", (q) => q.eq("tourId", tourId))
				.collect(),
		);
		expect(dates.length).toBe(366);
		expect(dates.some((d) => d.date > "2028-01-01")).toBe(false);
		expect(dates.some((d) => d.date === "2028-01-01")).toBe(true);
	});

	it("reports no truncation for a window inside the cap", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run((ctx) => seedTour(ctx, ORG, 2));

		await t.mutation(internal.tourSeasonalSchedules.internalCreate, {
			organizationId: ORG,
			userId: "user-1",
			tourId,
			name: "Daily, one month",
			startDate: "2027-03-01",
			endDate: "2027-03-31",
			daysOfWeek: ALL_DAYS,
			startTime: "10:00",
			capacityOverride: 10,
		});

		const result = await t.mutation(
			internal.tourSeasonalSchedules.internalGenerate,
			{
				organizationId: ORG,
				userId: "user-1",
				tourId,
				dateFrom: "2027-03-01",
				dateTo: "2027-03-31",
			},
		);

		expect(result.truncated).toBe(false);
		expect(result.processedTo).toBe("2027-03-31");
		expect(result.requestedTo).toBe("2027-03-31");
		expect(result.created).toBe(31);
	});

	it("records the truncation in the audit entry too", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run((ctx) => seedTour(ctx, ORG, 2));
		await t.mutation(internal.tourSeasonalSchedules.internalCreate, {
			organizationId: ORG,
			userId: "user-1",
			tourId,
			name: "Daily, audited",
			startDate: "2027-01-01",
			endDate: "2028-12-31",
			daysOfWeek: ALL_DAYS,
			startTime: "10:00",
			capacityOverride: 10,
		});
		await t.mutation(internal.tourSeasonalSchedules.internalGenerate, {
			organizationId: ORG,
			userId: "user-1",
			tourId,
			dateFrom: "2027-01-01",
			dateTo: "2028-12-31",
		});

		const audits = await t.run(async (ctx) =>
			ctx.db
				.query("auditLogs")
				.withIndex("by_resource", (q) =>
					q.eq("resourceType", "tour").eq("resourceId", tourId),
				)
				.collect(),
		);
		const gen = audits.find((a) => a.action === "tourSeasonalSchedule.generated");
		expect(gen).toBeTruthy();
		const nv = gen?.newValues as Record<string, unknown>;
		expect(nv.truncated).toBe(true);
		expect(nv.processedTo).toBe("2028-01-01");
		expect(nv.maxDays).toBe(366);
	});
});
