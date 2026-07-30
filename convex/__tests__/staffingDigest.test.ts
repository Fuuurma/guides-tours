// Tests for convex/staffingDigest.ts internal queries.
//
// Coverage:
//   1. gapsForOrg — returns staffing gaps for an org within a date range
//      (assignments with unfilled guide/driver/vehicle positions)
//   2. gapsForOrg — returns [] when no assignments (or schedules) exist
//   3. gapsForOrg — returns [] when all departures are fully staffed
//   4. listDigestTargets — returns orgs that have the staffing digest
//      enabled with an email and/or phone
//   5. listDigestTargets — returns [] when no orgs have the digest enabled
//
// gapsForOrg and listDigestTargets are internal queries (no auth context),
// so they are invoked via `internal.staffingDigest.*`. We still mock
// `../auth` (imported transitively via lib/authz) so module loading stays
// isolated from the Better Auth component, matching the pattern used in
// organizations.test.ts.

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import schema from "../schema";
import { internal } from "../_generated/api";

// ---- Hoisted mock state (shared with vi.mock factories) --------------------

const { mockState } = vi.hoisted(() => ({
	mockState: {
		user: null as {
			_id: string;
			name: string;
			email: string;
			phone?: string;
			image?: string | null;
		} | null,
		session: null as { activeOrganizationId?: string | null } | null,
		orgs: [] as Array<{
			id: string;
			name: string;
			slug: string;
			logo?: string | null;
			createdAt: number;
			members: Array<{ userId: string; role: string }>;
		}>,
	},
}));

// `../auth` is imported transitively by lib/authz.ts (which staffingDigest
// imports for the sendNow mutation). The internal queries under test never
// call into auth, but mocking keeps module load isolated from the Better
// Auth component — same pattern as organizations.test.ts.
vi.mock("../auth", () => ({
	authComponent: {
		getAuthUser: async () => mockState.user,
		safeGetAuthUser: async () => mockState.user ?? undefined,
		getAuth: async () => ({
			auth: {
				api: {
					getSession: async () =>
						mockState.session
							? { session: mockState.session, user: mockState.user }
							: null,
					getFullOrganization: async (args: {
						query: { organizationId: string };
					}) =>
						mockState.orgs.find((o) => o.id === args.query.organizationId) ??
						null,
					listOrganizations: async () => mockState.orgs,
					listMembers: async (args: {
						query: { organizationId: string };
					}) => ({
						members:
							mockState.orgs.find((o) => o.id === args.query.organizationId)
								?.members ?? [],
					}),
				},
			},
			headers: new Headers(),
		}),
	},
	createAuth: (() => ({})) as never,
}));

const modules = import.meta.glob("../**/*.{ts,tsx}");

// ---- Helpers ---------------------------------------------------------------

type TestCtx = GenericMutationCtx<DataModel> & {
	storage: { getUrl: (id: string) => Promise<string | null> };
};

function setState(next: {
	user?: typeof mockState.user;
	session?: typeof mockState.session;
	orgs?: typeof mockState.orgs;
}) {
	mockState.user = next.user ?? null;
	mockState.session = next.session ?? null;
	mockState.orgs = next.orgs ?? [];
}

async function seedTour(
	ctx: TestCtx,
	orgId: string,
	overrides: Partial<{
		name: string;
		tourType: string;
		requiredGuides: number;
		requiresVehicle: boolean;
		requiresDriver: boolean;
	}> = {},
): Promise<Id<"tours">> {
	return await ctx.db.insert("tours", {
		organizationId: orgId,
		name: overrides.name ?? "Old Town Walk",
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
		tourType: overrides.tourType ?? "walking",
		languages: ["en"],
		requiredGuides: overrides.requiredGuides ?? 1,
		requiresVehicle: overrides.requiresVehicle,
		requiresDriver: overrides.requiresDriver,
		inclusions: [],
		exclusions: [],
		highlights: [],
		currency: "USD",
		createdAt: 0,
		updatedAt: 0,
	});
}

async function seedSchedule(
	ctx: TestCtx,
	orgId: string,
	tourId: Id<"tours">,
	overrides: Partial<{
		date: string;
		startTime: string;
		endTime: string;
		status: "available" | "full" | "cancelled";
		capacityBooked: number;
	}> = {},
): Promise<Id<"tourSchedules">> {
	return await ctx.db.insert("tourSchedules", {
		organizationId: orgId,
		tourId,
		date: overrides.date ?? "2026-09-01",
		startTime: overrides.startTime ?? "09:00",
		endTime: overrides.endTime ?? "11:00",
		capacityTotal: 10,
		capacityBooked: overrides.capacityBooked ?? 0,
		status: overrides.status ?? "available",
		notes: "",
		createdAt: 0,
		updatedAt: 0,
	});
}

async function seedAssignment(
	ctx: TestCtx,
	orgId: string,
	tourId: Id<"tours">,
	guideId: string,
	overrides: Partial<{
		date: string;
		startTime: string;
		endTime: string;
		vehicleId: Id<"vehicles">;
		driverId: Id<"drivers">;
		status: "scheduled" | "completed" | "cancelled";
	}> = {},
): Promise<Id<"assignments">> {
	return await ctx.db.insert("assignments", {
		organizationId: orgId,
		tourId,
		guideId,
		vehicleId: overrides.vehicleId,
		driverId: overrides.driverId,
		date: overrides.date ?? "2026-09-01",
		startTime: overrides.startTime ?? "09:00",
		endTime: overrides.endTime ?? "11:00",
		status: overrides.status ?? "scheduled",
		createdAt: 0,
		updatedAt: 0,
	});
}

async function seedVehicle(
	ctx: TestCtx,
	orgId: string,
): Promise<Id<"vehicles">> {
	return await ctx.db.insert("vehicles", {
		organizationId: orgId,
		name: "Van A",
		vehicleType: "van",
		capacity: 8,
		licensePlate: "ABC-123",
		make: "Ford",
		model: "Transit",
		color: "white",
		ownershipType: "owned",
		status: "available",
		notes: "",
		createdAt: 0,
		updatedAt: 0,
	});
}

async function seedDriver(
	ctx: TestCtx,
	orgId: string,
	userId = "driver-1",
): Promise<Id<"drivers">> {
	return await ctx.db.insert("drivers", {
		organizationId: orgId,
		userId,
		licenseInfo: "x",
		availability: {},
		notes: "",
		isActive: true,
		createdAt: 0,
		updatedAt: 0,
	});
}

async function seedNotificationSettings(
	ctx: TestCtx,
	orgId: string,
	overrides: Partial<{
		staffingDigestEnabled: boolean;
		staffingDigestEmail: string;
		staffingDigestPhone: string;
		staffingDigestDaysAhead: number;
		emailEnabled: boolean;
		emailFromEmail: string;
		emailFromName: string;
		phoneRemindWithDigest: boolean;
	}> = {},
): Promise<Id<"notificationSettings">> {
	return await ctx.db.insert("notificationSettings", {
		organizationId: orgId,
		twilioEnabled: false,
		whatsappEnabled: false,
		emailEnabled: overrides.emailEnabled ?? false,
		emailFromName: overrides.emailFromName,
		emailFromEmail: overrides.emailFromEmail,
		useCompanyDefaults: true,
		requireSmsConsent: true,
		requireEmailConsent: true,
		maxRetries: 3,
		retryDelayMinutes: 5,
		staffingDigestEnabled: overrides.staffingDigestEnabled,
		staffingDigestEmail: overrides.staffingDigestEmail,
		staffingDigestPhone: overrides.staffingDigestPhone,
		staffingDigestDaysAhead: overrides.staffingDigestDaysAhead,
		phoneRemindWithDigest: overrides.phoneRemindWithDigest,
		createdAt: 0,
		updatedAt: 0,
	});
}

// ---- Tests -----------------------------------------------------------------

describe("convex/staffingDigest — gapsForOrg", () => {
	beforeEach(() => setState({}));

	it("returns staffing gaps for an org within a date range (unfilled driver/vehicle)", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_gaps";
		// Car tour: requires a vehicle + driver (inferred from tourType).
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId, {
				name: "City Car Tour",
				tourType: "car",
				requiredGuides: 1,
			}),
		);
		await t.run(async (ctx) =>
			seedSchedule(ctx as unknown as TestCtx, orgId, tourId, {
				date: "2026-09-01",
				startTime: "09:00",
				endTime: "11:00",
				capacityBooked: 2,
			}),
		);
		// Guide is assigned, but no vehicle/driver → vehicle + driver gaps.
		await t.run(async (ctx) =>
			seedAssignment(ctx as unknown as TestCtx, orgId, tourId, "guide-1", {
				date: "2026-09-01",
				startTime: "09:00",
				endTime: "11:00",
			}),
		);

		const gaps = (await t.query(internal.staffingDigest.gapsForOrg, {
			organizationId: orgId,
			dateFrom: "2026-09-01",
			dateTo: "2026-09-07",
		})) as Array<{
			tourName: string;
			date: string;
			startTime: string;
			guideCount: number;
			requiredGuides: number;
			guidesNeeded: number;
			requiresVehicle: boolean;
			requiresDriver: boolean;
			hasVehicle: boolean;
			hasDriver: boolean;
			gaps: string[];
		}>;

		expect(gaps).toHaveLength(1);
		const gap = gaps[0]!;
		expect(gap.tourName).toBe("City Car Tour");
		expect(gap.date).toBe("2026-09-01");
		expect(gap.startTime).toBe("09:00");
		// Guide slot is filled…
		expect(gap.guideCount).toBe(1);
		expect(gap.requiredGuides).toBe(1);
		expect(gap.guidesNeeded).toBe(0);
		// …but vehicle + driver are still missing.
		expect(gap.requiresVehicle).toBe(true);
		expect(gap.requiresDriver).toBe(true);
		expect(gap.hasVehicle).toBe(false);
		expect(gap.hasDriver).toBe(false);
		expect(gap.gaps).toEqual(expect.arrayContaining(["vehicle", "driver"]));
		expect(gap.gaps).not.toContain("guides");
	});

	it("returns an empty array when no assignments (or schedules) exist", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_empty";
		// A tour exists, but no schedules and no assignments in the window.
		await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);

		const gaps = await t.query(internal.staffingDigest.gapsForOrg, {
			organizationId: orgId,
			dateFrom: "2026-09-01",
			dateTo: "2026-09-07",
		});

		expect(gaps).toEqual([]);
	});

	it("returns an empty array when all departures are fully staffed", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_staffed";
		// Walking tour: only needs 1 guide (no vehicle/driver).
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId, {
				name: "Old Town Walk",
				tourType: "walking",
				requiredGuides: 1,
			}),
		);
		const scheduleId = await t.run(async (ctx) =>
			seedSchedule(ctx as unknown as TestCtx, orgId, tourId, {
				date: "2026-09-01",
				startTime: "09:00",
			}),
		);
		// Fully staffed: one guide assigned to the matching slot.
		await t.run(async (ctx) =>
			seedAssignment(ctx as unknown as TestCtx, orgId, tourId, "guide-1", {
				date: "2026-09-01",
				startTime: "09:00",
			}),
		);
		// Also seed a fully-staffed car tour (guide + vehicle + driver).
		const carTourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId, {
				name: "City Car Tour",
				tourType: "car",
				requiredGuides: 1,
			}),
		);
		await t.run(async (ctx) =>
			seedSchedule(ctx as unknown as TestCtx, orgId, carTourId, {
				date: "2026-09-02",
				startTime: "10:00",
			}),
		);
		const vehicleId = await t.run(async (ctx) =>
			seedVehicle(ctx as unknown as TestCtx, orgId),
		);
		const driverId = await t.run(async (ctx) =>
			seedDriver(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedAssignment(ctx as unknown as TestCtx, orgId, carTourId, "guide-2", {
				date: "2026-09-02",
				startTime: "10:00",
				vehicleId,
				driverId,
			}),
		);

		const gaps = await t.query(internal.staffingDigest.gapsForOrg, {
			organizationId: orgId,
			dateFrom: "2026-09-01",
			dateTo: "2026-09-07",
		});

		expect(gaps).toEqual([]);
		// Sanity: the schedule we seeded really exists (guards against a
		// false pass from a date-range mismatch).
		const schedules = await t.run(async (ctx) =>
			ctx.db.get(scheduleId),
		);
		expect(schedules).not.toBeNull();
	});
});

describe("convex/staffingDigest — listDigestTargets", () => {
	beforeEach(() => setState({}));

	it("returns orgs that have the staffing digest enabled with email/phone", async () => {
		const t = convexTest(schema, modules);
		// Org A: digest enabled with email + phone.
		await t.run(async (ctx) =>
			seedNotificationSettings(ctx as unknown as TestCtx, "org_a", {
				staffingDigestEnabled: true,
				staffingDigestEmail: "ops@orga.example",
				staffingDigestPhone: "+15550000001",
				staffingDigestDaysAhead: 5,
				emailEnabled: true,
				emailFromEmail: "no-reply@orga.example",
				emailFromName: "OrgA Ops",
				phoneRemindWithDigest: true,
			}),
		);
		// Org B: digest enabled with email only.
		await t.run(async (ctx) =>
			seedNotificationSettings(ctx as unknown as TestCtx, "org_b", {
				staffingDigestEnabled: true,
				staffingDigestEmail: "ops@orgb.example",
				emailEnabled: false,
			}),
		);

		const targets = (await t.query(internal.staffingDigest.listDigestTargets, {})) as Array<{
			organizationId: string;
			email?: string;
			phone?: string;
			daysAhead: number;
			emailEnabled: boolean;
			emailFromEmail?: string;
			emailFromName?: string;
			phoneRemindWithDigest: boolean;
		}>;

		expect(targets).toHaveLength(2);
		const a = targets.find((tg) => tg.organizationId === "org_a");
		const b = targets.find((tg) => tg.organizationId === "org_b");
		expect(a?.email).toBe("ops@orga.example");
		expect(a?.phone).toBe("+15550000001");
		expect(a?.daysAhead).toBe(5);
		expect(a?.emailEnabled).toBe(true);
		expect(a?.emailFromEmail).toBe("no-reply@orga.example");
		expect(a?.emailFromName).toBe("OrgA Ops");
		expect(a?.phoneRemindWithDigest).toBe(true);
		expect(b?.email).toBe("ops@orgb.example");
		expect(b?.phone).toBeUndefined();
		expect(b?.emailEnabled).toBe(false);
		expect(b?.phoneRemindWithDigest).toBe(false);
	});

	it("returns an empty array when no orgs have the digest enabled", async () => {
		const t = convexTest(schema, modules);
		// Org C: digest disabled.
		await t.run(async (ctx) =>
			seedNotificationSettings(ctx as unknown as TestCtx, "org_c", {
				staffingDigestEnabled: false,
				staffingDigestEmail: "ops@orgc.example",
			}),
		);
		// Org D: digest enabled but no email AND no phone → filtered out.
		await t.run(async (ctx) =>
			seedNotificationSettings(ctx as unknown as TestCtx, "org_d", {
				staffingDigestEnabled: true,
			}),
		);
		// Org E: digest flag unset (undefined) → filtered out.
		await t.run(async (ctx) =>
			seedNotificationSettings(ctx as unknown as TestCtx, "org_e", {
				staffingDigestEmail: "ops@orge.example",
			}),
		);

		const targets = await t.query(internal.staffingDigest.listDigestTargets, {});

		expect(targets).toEqual([]);
	});
});
