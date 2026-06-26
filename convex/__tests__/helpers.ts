// Shared test helpers for convex-test.
//
// These replace ~30-line `seedTour`/`seedCustomer`/`seedBooking`
// boilerplate that was duplicated across 20+ test files. All helpers
// are async functions that take a GenericMutationCtx (or
// `any` for max compat with convexTest's t.run) and return the
// inserted IDs.

import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";

export type TestCtx = GenericMutationCtx<DataModel>;

// ---- Tours ----

export interface SeedTourOptions {
	orgId: string;
	name?: string;
	tourType?: "walking" | "car" | "minivan" | "bus" | "boat" | "other";
	maxGuests?: number;
	capacity?: number;
	isActive?: boolean;
	deletedAt?: number;
}

export async function seedTour(
	ctx: TestCtx,
	opts: SeedTourOptions,
): Promise<Id<"tours">> {
	const maxGuests = opts.maxGuests ?? 15;
	return await ctx.db.insert("tours", {
		organizationId: opts.orgId,
		name: opts.name ?? "Test Tour",
		description: "",
		durationHours: 2,
		isActive: opts.isActive ?? true,
		recurrenceType: "none",
		recurrenceDaysOfWeek: [],
		capacity: opts.capacity ?? maxGuests,
		bufferMinutes: 15,
		minGuests: 1,
		maxGuests,
		bookingCutoffHours: 24,
		tourType: opts.tourType ?? "walking",
		languages: ["en"],
		requiredGuides: 1,
		inclusions: [],
		exclusions: [],
		highlights: [],
		currency: "USD",
		createdAt: 0,
		updatedAt: 0,
		deletedAt: opts.deletedAt,
	});
}

// ---- Customers ----

export interface SeedCustomerOptions {
	orgId: string;
	name?: string;
	email?: string;
	phone?: string;
}

export async function seedCustomer(
	ctx: TestCtx,
	opts: SeedCustomerOptions,
): Promise<Id<"customers">> {
	return await ctx.db.insert("customers", {
		organizationId: opts.orgId,
		name: opts.name ?? "Test Customer",
		email: opts.email ?? `customer-${Date.now()}-${Math.random()}@example.com`,
		phone: opts.phone ?? "+1555000000",
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

// ---- Bookings ----

export interface SeedBookingOptions {
	orgId: string;
	tourId: Id<"tours">;
	customerId: Id<"customers">;
	date?: string;
	startTime?: string;
	guests?: number;
	status?: "pending" | "confirmed" | "checked_in" | "completed" | "cancelled";
	totalAmountCents?: bigint;
	depositAmountCents?: bigint;
	source?: string;
}

export async function seedBooking(
	ctx: TestCtx,
	opts: SeedBookingOptions,
): Promise<Id<"bookings">> {
	const totalAmountCents = opts.totalAmountCents ?? 10000n;
	const depositAmountCents = opts.depositAmountCents ?? 0n;
	return await ctx.db.insert("bookings", {
		organizationId: opts.orgId,
		tourId: opts.tourId,
		customerId: opts.customerId,
		date: opts.date ?? "2026-07-15",
		startTime: opts.startTime ?? "09:00",
		guests: opts.guests ?? 2,
		guestNames: "",
		languageRequired: "en",
		notes: "",
		status: opts.status ?? "confirmed",
		depositAmountCents,
		totalAmountCents,
		balanceDueCents: totalAmountCents - depositAmountCents,
		paymentMethod: "",
		checkedInBy: "",
		netRevenueCents: totalAmountCents,
		source: opts.source ?? "direct",
		reviewComment: "",
		createdAt: 0,
		updatedAt: 0,
	});
}

// ---- Tour Schedules ----

export interface SeedScheduleOptions {
	orgId: string;
	tourId: Id<"tours">;
	date?: string;
	startTime?: string;
	endTime?: string;
	capacityTotal?: number;
	capacityBooked?: number;
}

export async function seedSchedule(
	ctx: TestCtx,
	opts: SeedScheduleOptions,
): Promise<Id<"tourSchedules">> {
	return await ctx.db.insert("tourSchedules", {
		organizationId: opts.orgId,
		tourId: opts.tourId,
		date: opts.date ?? "2026-07-15",
		startTime: opts.startTime ?? "09:00",
		endTime: opts.endTime ?? "11:00",
		capacityTotal: opts.capacityTotal ?? 10,
		capacityBooked: opts.capacityBooked ?? 0,
		status: "available",
		notes: "",
		createdAt: 0,
		updatedAt: 0,
	});
}

// ---- Vehicles ----

export interface SeedVehicleOptions {
	orgId: string;
	name?: string;
	vehicleType?: string;
	capacity?: number;
}

export async function seedVehicle(
	ctx: TestCtx,
	opts: SeedVehicleOptions,
): Promise<Id<"vehicles">> {
	return await ctx.db.insert("vehicles", {
		organizationId: opts.orgId,
		name: opts.name ?? "Van A",
		vehicleType: opts.vehicleType ?? "van",
		capacity: opts.capacity ?? 8,
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

// ---- Drivers ----

export interface SeedDriverOptions {
	orgId: string;
	userId: string;
	licenseInfo?: string;
	isActive?: boolean;
}

export async function seedDriver(
	ctx: TestCtx,
	opts: SeedDriverOptions,
): Promise<Id<"drivers">> {
	return await ctx.db.insert("drivers", {
		organizationId: opts.orgId,
		userId: opts.userId,
		licenseInfo: opts.licenseInfo ?? "Class B",
		availability: {},
		notes: "",
		isActive: opts.isActive ?? true,
		createdAt: 0,
		updatedAt: 0,
	});
}

// ---- Assignments ----

export interface SeedAssignmentOptions {
	orgId: string;
	tourId: Id<"tours">;
	guideId: string;
	date?: string;
	startTime?: string;
	endTime?: string;
	status?: "scheduled" | "completed" | "cancelled";
	vehicleId?: Id<"vehicles">;
	driverId?: Id<"drivers">;
}

export async function seedAssignment(
	ctx: TestCtx,
	opts: SeedAssignmentOptions,
): Promise<Id<"assignments">> {
	return await ctx.db.insert("assignments", {
		organizationId: opts.orgId,
		tourId: opts.tourId,
		guideId: opts.guideId,
		vehicleId: opts.vehicleId,
		driverId: opts.driverId,
		date: opts.date ?? "2026-07-15",
		startTime: opts.startTime ?? "09:00",
		endTime: opts.endTime ?? "11:00",
		status: opts.status ?? "scheduled",
		createdAt: 0,
		updatedAt: 0,
	});
}

// ---- Better Auth entities (for tests that need org/user membership) ----

export interface SeedOrgOptions {
	id?: string;
	name?: string;
	slug?: string;
}

export async function seedOrg(
	ctx: TestCtx,
	opts: SeedOrgOptions = {},
): Promise<string> {
	const id = opts.id ?? `org-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	await ctx.db.insert("organizations" as never, {
		id,
		name: opts.name ?? "Test Org",
		slug: opts.slug ?? id,
		createdAt: 0,
		updatedAt: 0,
	} as never);
	return id;
}

export interface SeedMemberOptions {
	orgId: string;
	userId: string;
	role?: "owner" | "admin" | "member" | "guide";
}

export async function seedMember(
	ctx: TestCtx,
	opts: SeedMemberOptions,
): Promise<string> {
	// `members` is a Better Auth runtime table (not in our schema),
	// so we use `as never` and return a string ID.
	return (await ctx.db.insert("members" as never, {
		organizationId: opts.orgId,
		userId: opts.userId,
		role: opts.role ?? "owner",
		createdAt: 0,
	} as never)) as unknown as string;
}

export interface SeedSessionOptions {
	userId: string;
}

export async function seedSession(
	ctx: TestCtx,
	opts: SeedSessionOptions,
): Promise<string> {
	return (await ctx.db.insert("sessions" as never, {
		userId: opts.userId,
		expiresAt: Date.now() + 60 * 60 * 1000,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		token: `test-token-${opts.userId}-${Math.random()}`,
	} as never)) as unknown as string;
}

// ---- Tour Blackout Dates ----

export interface SeedBlackoutOptions {
	orgId: string;
	tourId: Id<"tours">;
	startDate: string;
	endDate: string;
	reason?: string;
}

export async function seedBlackout(
	ctx: TestCtx,
	opts: SeedBlackoutOptions,
): Promise<Id<"tourBlackoutDates">> {
	return await ctx.db.insert("tourBlackoutDates", {
		organizationId: opts.orgId,
		tourId: opts.tourId,
		startDate: opts.startDate,
		endDate: opts.endDate,
		reason: opts.reason ?? "Test blackout",
		createdAt: 0,
		updatedAt: 0,
	});
}

// ---- Tour Seasonal Schedules ----

export interface SeedSeasonalOptions {
	orgId: string;
	tourId: Id<"tours">;
	name: string;
	startDate: string;
	endDate: string;
	daysOfWeek?: number[];
	priority?: number;
	isActive?: boolean;
}

export async function seedSeasonal(
	ctx: TestCtx,
	opts: SeedSeasonalOptions,
): Promise<Id<"tourSeasonalSchedules">> {
	return await ctx.db.insert("tourSeasonalSchedules", {
		organizationId: opts.orgId,
		tourId: opts.tourId,
		name: opts.name,
		startDate: opts.startDate,
		endDate: opts.endDate,
		daysOfWeek: opts.daysOfWeek ?? [1, 2, 3, 4, 5],
		startTime: "09:00",
		capacityOverride: undefined,
		isActive: opts.isActive ?? true,
		priority: opts.priority ?? 0,
		notes: "",
		createdAt: 0,
		updatedAt: 0,
	});
}

// ---- Tour Exception Dates ----

export interface SeedExceptionOptions {
	orgId: string;
	tourId: Id<"tours">;
	date: string;
	exceptionType: "added" | "removed" | "modified";
	reason?: string;
}

export async function seedException(
	ctx: TestCtx,
	opts: SeedExceptionOptions,
): Promise<Id<"tourExceptionDates">> {
	return await ctx.db.insert("tourExceptionDates", {
		organizationId: opts.orgId,
		tourId: opts.tourId,
		date: opts.date,
		exceptionType: opts.exceptionType,
		reason: opts.reason ?? "Test exception",
		notes: "",
		createdAt: 0,
		updatedAt: 0,
	});
}

// ---- Tour Images ----

export interface SeedImageOptions {
	orgId: string;
	tourId: Id<"tours">;
	storageId: Id<"_storage">;
	displayOrder?: number;
	isPrimary?: boolean;
}

export async function seedImage(
	ctx: TestCtx,
	opts: SeedImageOptions,
): Promise<Id<"tourImages">> {
	return await ctx.db.insert("tourImages", {
		organizationId: opts.orgId,
		tourId: opts.tourId,
		storageId: opts.storageId,
		altText: "Test image",
		isPrimary: opts.isPrimary ?? false,
		displayOrder: opts.displayOrder ?? 0,
		width: 100,
		height: 100,
		fileSize: 1000,
		format: "jpeg",
		createdAt: 0,
		updatedAt: 0,
	});
}

// ---- Tour Templates ----

export interface SeedTemplateOptions {
	orgId: string;
	name: string;
	durationHours?: number;
	capacity?: number;
	tourType?: string;
}

export async function seedTemplate(
	ctx: TestCtx,
	opts: SeedTemplateOptions,
): Promise<Id<"tourTemplates">> {
	return await ctx.db.insert("tourTemplates", {
		organizationId: opts.orgId,
		name: opts.name,
		description: "",
		durationHours: opts.durationHours ?? 2,
		capacity: opts.capacity ?? 10,
		tourType: opts.tourType ?? "walking",
		languages: ["en"],
		inclusions: [],
		exclusions: [],
		highlights: [],
		minGuests: 1,
		maxGuests: 10,
		bookingCutoffHours: 24,
		requiredGuides: 1,
		isActive: true,
		createdAt: 0,
		updatedAt: 0,
	});
}

// ---- Tour Categories ----

export interface SeedCategoryOptions {
	orgId: string;
	name: string;
	slug: string;
}

export async function seedCategory(
	ctx: TestCtx,
	opts: SeedCategoryOptions,
): Promise<Id<"tourCategories">> {
	return await ctx.db.insert("tourCategories", {
		organizationId: opts.orgId,
		name: opts.name,
		slug: opts.slug,
		description: "",
		icon: "map",
		color: "blue",
		displayOrder: 0,
		isActive: true,
		createdAt: 0,
		updatedAt: 0,
	});
}
