// Convex schema for guides-tours.
// Source: reservations-automation (Django 5) — see PORT-CHECKLIST.md for
// the per-model port mapping.
//
// Notes on this schema:
// - `user`, `session`, `account`, `organization`, `member`, `invitation`
//   are owned by Better Auth + its organization plugin (see convex/auth.ts).
//   Domain tables reference them via v.id("user") and v.id("organization").
// - All sensitive string fields (OTA keys/secrets, Stripe secrets) are
//   stored as ciphertext via convex/lib/crypto.ts. The application layer
//   encrypts before insert, decrypts after read.
// - Money fields are cents-only (v.int64()) — Django DecimalField dollars
//   were dropped during migration.
// - JSON-shaped fields use v.any() until we tighten with v.union/record.
// - Soft deletes: source uses is_active flags and CASCADE ForeignKeys.
//   In Convex we use a `deletedAt: v.optional(v.number())` pattern for
//   soft delete and actual deletion for hard remove (no CASCADE).
// - Index naming: "by_<field>" for single-field, "by_<a>_<b>" for
//   compound. Convex requires indexes for any query that's expected to
//   scan >1000 documents.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Better Auth user reference. The `user` table is owned by the
// @convex-dev/better-auth component, NOT by this app's schema, so we
// store Better Auth user IDs as plain strings here. Same for org IDs.
const userId = v.string();
// Better Auth organization reference (provided by the org plugin).
const orgId = v.string();

// Soft-delete timestamp for tables where source uses is_active flags.
const softDelete = {
	deletedAt: v.optional(v.number()),
};

// Encrypted-string sentinel: caller must use convex/lib/crypto.ts to
// encrypt before insert and decrypt after read. Never store plaintext
// in fields documented as `v.string()` with "encrypted" in the name.
const encryptedString = v.string();

// Currency code (ISO 4217, e.g. "USD", "EUR").
const currency = v.string();

// JSON-shaped field that we don't type-check at the schema boundary.
// Refine per-table as usage patterns emerge.
const jsonField = v.any();

export default defineSchema({
	// ----- Guides / staff -----

	// The Django source's `User` model is split:
	//   - Core identity (email, name, password, MFA): Better Auth `user`.
	//   - Role + per-org membership: Better Auth org `member.role`.
	//   - Per-user profile (phone, bio, photo, vacationDays, isActive):
	//     registered as Better Auth user `additionalFields`.
	// Domain tables below reference Better Auth user IDs (v.string()).

	availabilities: defineTable({
		organizationId: orgId,
		userId, // the guide whose availability this is
		date: v.string(), // ISO date YYYY-MM-DD
		isAvailable: v.boolean(),
		createdAt: v.number(),
	})
		.index("by_org_user_date", ["organizationId", "userId", "date"])
		.index("by_user_date", ["userId", "date"]),

	vacationRequests: defineTable({
		organizationId: orgId,
		userId,
		startDate: v.string(), // ISO date
		endDate: v.string(),
		reason: v.string(),
		status: v.union(
			v.literal("pending"),
			v.literal("approved"),
			v.literal("rejected"),
		),
		reviewedBy: v.optional(v.string()),
		reviewedAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org_status", ["organizationId", "status"])
		.index("by_user", ["userId"])
		.index("by_user_status", ["userId", "status"])
		.index("by_org", ["organizationId"]),

	// ----- Tours -----

	tours: defineTable({
		organizationId: orgId,
		name: v.string(),
		description: v.string(),
		defaultTime: v.optional(v.string()), // "HH:MM"
		durationHours: v.number(),
		isActive: v.boolean(),
		// Recurrence (None | Daily | Weekly) — source choices enum
		recurrenceType: v.union(
			v.literal("none"),
			v.literal("daily"),
			v.literal("weekly"),
		),
		// JSON: [0..6] Monday-based when recurrenceType=weekly
		recurrenceDaysOfWeek: v.array(v.number()),
		recurrenceEndDate: v.optional(v.string()),
		capacity: v.number(),
		bufferMinutes: v.number(),
		minGuests: v.number(),
		maxGuests: v.number(),
		bookingCutoffHours: v.number(),
		// Source: walkable | car | minivan | bus (extensible)
		tourType: v.string(),
		// JSON: ["en","es",...]
		languages: v.array(v.string()),
		requiredGuides: v.number(),
		// FK -> tourCategories
		categoryId: v.optional(v.id("tourCategories")),
		// FK -> tourTemplates (optional — template it was created from)
		templateId: v.optional(v.id("tourTemplates")),
		// JSON: ["included item 1", ...]
		inclusions: v.array(v.string()),
		exclusions: v.array(v.string()),
		highlights: v.array(v.string()),
		basePriceCents: v.optional(v.int64()),
		currency,
		createdAt: v.number(),
		updatedAt: v.number(),
		...softDelete,
	})
		.index("by_org", ["organizationId"])
		.index("by_org_active", ["organizationId", "isActive"])
		.index("by_org_category", ["organizationId", "categoryId"])
		.index("by_org_type", ["organizationId", "tourType"]),

	tourCategories: defineTable({
		organizationId: orgId,
		name: v.string(),
		slug: v.string(),
		description: v.string(),
		icon: v.string(),
		color: v.string(),
		displayOrder: v.number(),
		isActive: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_slug", ["organizationId", "slug"])
		.index("by_org_active", ["organizationId", "isActive"]),

	tourTemplates: defineTable({
		organizationId: orgId,
		name: v.string(),
		description: v.string(),
		durationHours: v.number(),
		defaultTime: v.optional(v.string()),
		capacity: v.number(),
		tourType: v.string(),
		categoryId: v.optional(v.id("tourCategories")),
		languages: v.array(v.string()),
		inclusions: v.array(v.string()),
		exclusions: v.array(v.string()),
		highlights: v.array(v.string()),
		minGuests: v.number(),
		maxGuests: v.number(),
		bookingCutoffHours: v.number(),
		requiredGuides: v.number(),
		isActive: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_active", ["organizationId", "isActive"])
		.index("by_org_category", ["organizationId", "categoryId"]),

	tourSchedules: defineTable({
		organizationId: orgId,
		tourId: v.id("tours"),
		date: v.string(),
		startTime: v.string(),
		endTime: v.string(),
		capacityTotal: v.number(),
		capacityBooked: v.number(),
		// Source: AVAILABLE | FULL | CANCELLED
		status: v.union(
			v.literal("available"),
			v.literal("full"),
			v.literal("cancelled"),
		),
		notes: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_tour_date", ["tourId", "date"])
		.index("by_org_date", ["organizationId", "date"])
		.index("by_org_status_date", ["organizationId", "status", "date"]),

	tourBlackoutDates: defineTable({
		organizationId: orgId,
		tourId: v.id("tours"),
		startDate: v.string(),
		endDate: v.string(),
		reason: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_tour_start", ["tourId", "startDate"])
		.index("by_org_start", ["organizationId", "startDate"]),

	tourSeasonalSchedules: defineTable({
		organizationId: orgId,
		tourId: v.id("tours"),
		name: v.string(),
		startDate: v.string(),
		endDate: v.string(),
		daysOfWeek: v.array(v.number()), // [0..6]
		startTime: v.optional(v.string()),
		capacityOverride: v.optional(v.number()),
		isActive: v.boolean(),
		priority: v.number(),
		notes: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_tour_range", ["tourId", "startDate", "endDate"])
		.index("by_tour_active", ["tourId", "isActive"]),

	tourExceptionDates: defineTable({
		organizationId: orgId,
		tourId: v.id("tours"),
		date: v.string(),
		// ADDED | REMOVED | MODIFIED
		exceptionType: v.union(
			v.literal("added"),
			v.literal("removed"),
			v.literal("modified"),
		),
		startTime: v.optional(v.string()),
		endTime: v.optional(v.string()),
		capacityOverride: v.optional(v.number()),
		reason: v.string(),
		notes: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_tour_date", ["tourId", "date"])
		.index("by_tour_type", ["tourId", "exceptionType"]),

	tourAnalytics: defineTable({
		organizationId: orgId,
		tourId: v.id("tours"),
		periodDate: v.string(),
		// DAILY | WEEKLY | MONTHLY
		periodType: v.union(
			v.literal("daily"),
			v.literal("weekly"),
			v.literal("monthly"),
		),
		totalBookings: v.number(),
		totalGuests: v.number(),
		grossRevenueCents: v.int64(),
		netRevenueCents: v.int64(),
		cancellations: v.number(),
		noShows: v.number(),
		avgGroupSize: v.number(),
		utilizationRate: v.number(), // 0..1
		totalCapacity: v.number(),
		calculatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_period", ["organizationId", "periodDate", "periodType"])
		.index("by_tour_period", ["tourId", "periodDate"])
		.index("by_period", ["periodType", "periodDate"]),

	// ----- Images -----

	tourImages: defineTable({
		organizationId: orgId,
		tourId: v.id("tours"),
		// Convex storage ID (not a URL) — clients call ctx.storage.getUrl()
		storageId: v.id("_storage"),
		altText: v.string(),
		isPrimary: v.boolean(),
		displayOrder: v.number(),
		width: v.number(),
		height: v.number(),
		fileSize: v.number(),
		format: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_tour", ["tourId"])
		.index("by_tour_primary", ["tourId", "isPrimary"])
		.index("by_tour_order", ["tourId", "displayOrder"]),

	// ----- Fleet -----

	vehicles: defineTable({
		organizationId: orgId,
		name: v.string(),
		// BUS | MINIBUS | VAN | SEDAN | CAR | LIMOUSINE | BOAT | OTHER
		vehicleType: v.string(),
		capacity: v.number(),
		licensePlate: v.string(),
		make: v.string(),
		model: v.string(),
		year: v.optional(v.number()),
		color: v.string(),
		// OWNED | LEASED | RENTAL ("" when unknown)
		ownershipType: v.string(),
		// AVAILABLE | IN_USE | MAINTENANCE | RETIRED | ACTIVE
		status: v.string(),
		notes: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_status", ["organizationId", "status"])
		.index("by_org_type", ["organizationId", "vehicleType"])
		.index("by_org_plate", ["organizationId", "licensePlate"]),

	drivers: defineTable({
		organizationId: orgId,
		userId, // FK -> better-auth "user" (the person who drives)
		licenseInfo: v.string(),
		// JSON: { monday: true, tuesday: false, ... }
		availability: jsonField,
		notes: v.string(),
		isActive: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_active", ["organizationId", "isActive"])
		.index("by_user", ["userId"]),

	// ----- Assignments -----

	// A guide + vehicle + driver assigned to a tour on a specific date/time.
	assignments: defineTable({
		organizationId: orgId,
		tourId: v.id("tours"),
		// FK -> userProfiles (the guide)
		guideId: v.string(),
		vehicleId: v.optional(v.id("vehicles")),
		driverId: v.optional(v.id("drivers")),
		date: v.string(),
		startTime: v.string(),
		endTime: v.optional(v.string()),
		// SCHEDULED | COMPLETED | CANCELLED
		status: v.union(
			v.literal("scheduled"),
			v.literal("completed"),
			v.literal("cancelled"),
		),
		createdAt: v.number(),
		updatedAt: v.number(),
		...softDelete,
	})
		.index("by_org", ["organizationId"])
		.index("by_org_date", ["organizationId", "date"])
		.index("by_org_status_date", ["organizationId", "status", "date"])
		.index("by_status_date", ["status", "date"])
		.index("by_tour_date", ["tourId", "date"])
		.index("by_guide_date", ["guideId", "date"])
		.index("by_vehicle_date", ["vehicleId", "date"])
		.index("by_driver_date", ["driverId", "date"]),

	// ----- Bookings -----

	customers: defineTable({
		organizationId: orgId,
		name: v.string(),
		email: v.string(),
		phone: v.string(),
		notes: v.string(),
		smsConsent: v.boolean(),
		emailConsent: v.boolean(),
		smsConsentDate: v.optional(v.number()),
		emailConsentDate: v.optional(v.number()),
		preferredLanguage: v.string(),
		// JSON: ["vip","repeat-buyer",...]
		tags: v.array(v.string()),
		source: v.string(),
		sourceDetails: v.string(),
		// FK -> userProfiles (their preferred guide, optional)
		preferredGuideId: v.optional(v.string()),
		specialRequirements: v.string(),
		vipStatus: v.boolean(),
		loyaltyPoints: v.number(),
		totalVisits: v.number(),
		totalRevenueCents: v.int64(),
		nextBookingDate: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_email", ["organizationId", "email"])
		.index("by_org_vip", ["organizationId", "vipStatus"])
		.index("by_org_next_booking", ["organizationId", "nextBookingDate"]),

	bookings: defineTable({
		organizationId: orgId,
		tourId: v.id("tours"),
		// Optional link to a concrete tourSchedule. When set, the
		// schedule's capacityBooked counter is incremented atomically
		// at create time and decremented at cancel time. OTA bookings
		// created before the schedule was instantiated may have this
		// unset — they fall back to the (tourId, date, startTime) lookup
		// at cancel time.
		scheduleId: v.optional(v.id("tourSchedules")),
		customerId: v.id("customers"),
		date: v.string(),
		startTime: v.string(),
		guests: v.number(),
		guestNames: v.string(), // comma-separated, source: TextField
		languageRequired: v.string(),
		notes: v.string(),
		// PENDING | CONFIRMED | CHECKED_IN | COMPLETED | CANCELLED
		status: v.union(
			v.literal("pending"),
			v.literal("confirmed"),
			v.literal("checked_in"),
			v.literal("completed"),
			v.literal("cancelled"),
		),
		// Cents-only (drop DecimalField dollars from source)
		depositAmountCents: v.int64(),
		totalAmountCents: v.int64(),
		balanceDueCents: v.int64(),
		paymentMethod: v.string(),
		checkedInAt: v.optional(v.number()),
		checkedInBy: v.string(),
		completedAt: v.optional(v.number()),
		netRevenueCents: v.int64(),
		source: v.string(), // "direct" | "viator" | etc
		reviewRating: v.optional(v.number()), // 1..5
		reviewComment: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_date", ["organizationId", "date"])
		.index("by_org_status", ["organizationId", "status"])
		.index("by_customer_date", ["customerId", "date"])
		.index("by_tour_date", ["tourId", "date"])
		.index("by_schedule", ["scheduleId"]),

	// ----- OTA -----

	// Encrypted credentials per provider per organization.
	// apiKey, apiSecret, webhookSecret are stored as ciphertext.
	otaIntegrations: defineTable({
		organizationId: orgId,
		// VIATOR | GETYOURGUIDE | AIRBNB | TRIPADVISOR | KLOOK | BOOKING | EXPEDIA
		provider: v.string(),
		apiKey: encryptedString,
		apiSecret: v.optional(encryptedString),
		partnerId: v.optional(v.string()),
		apiEndpoint: v.optional(v.string()),
		isActive: v.boolean(),
		isSandbox: v.boolean(),
		webhookSecret: v.optional(encryptedString),
		webhookUrl: v.optional(v.string()),
		autoSyncAvailability: v.boolean(),
		autoSyncPricing: v.boolean(),
		syncIntervalMinutes: v.number(),
		lastSyncAt: v.optional(v.number()),
		lastSyncStatus: v.optional(v.string()),
		lastSyncError: v.optional(v.string()),
		settings: jsonField,
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_provider", ["organizationId", "provider"])
		.index("by_org_active", ["organizationId", "isActive"]),

	otaProducts: defineTable({
		organizationId: orgId,
		tourId: v.id("tours"),
		integrationId: v.id("otaIntegrations"),
		otaProductId: v.string(),
		otaProductCode: v.optional(v.string()),
		otaProductUrl: v.optional(v.string()),
		// PENDING | SYNCING | SYNCED | ERROR | DISABLED
		syncStatus: v.string(),
		lastSyncAt: v.optional(v.number()),
		lastSyncError: v.optional(v.string()),
		otaTitle: v.optional(v.string()),
		otaDescription: v.optional(v.string()),
		otaPhotos: v.array(v.string()),
		otaDurationMinutes: v.optional(v.number()),
		otaPriceOriginalCents: v.optional(v.int64()),
		otaPriceSellingCents: v.optional(v.int64()),
		otaCurrency: v.string(),
		basePriceCents: v.optional(v.int64()),
		commissionRate: v.number(), // 0..1
		commissionAmountCents: v.optional(v.int64()),
		defaultCapacity: v.optional(v.number()),
		minAdvanceBookingHours: v.number(),
		maxAdvanceBookingDays: v.number(),
		settings: jsonField,
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_integration", ["integrationId"])
		.index("by_tour", ["tourId"]),

	otaBookings: defineTable({
		organizationId: orgId,
		// FK -> bookings (nullable — OTA booking may arrive before our record)
		bookingId: v.optional(v.id("bookings")),
		integrationId: v.id("otaIntegrations"),
		otaReservationId: v.string(),
		otaConfirmationCode: v.optional(v.string()),
		otaOrderNumber: v.optional(v.string()),
		otaCustomerName: v.optional(v.string()),
		otaCustomerEmail: v.optional(v.string()),
		otaCustomerPhone: v.optional(v.string()),
		otaCustomerCountry: v.optional(v.string()),
		otaCustomerData: jsonField,
		otaTourName: v.optional(v.string()),
		otaTourDate: v.optional(v.string()),
		otaTourTime: v.optional(v.string()),
		otaGuests: v.number(),
		otaTotalPaidCents: v.optional(v.int64()),
		otaCurrency: v.string(),
		commissionRate: v.optional(v.number()),
		commissionAmountCents: v.optional(v.int64()),
		netRevenueCents: v.optional(v.int64()),
		// PENDING | CONFIRMED | CANCELLED | REFUNDED
		status: v.string(),
		lastSyncAt: v.optional(v.number()),
		rawOtaData: jsonField,
		otaCreatedAt: v.optional(v.number()),
		receivedAt: v.number(),
		confirmedAt: v.optional(v.number()),
		cancelledAt: v.optional(v.number()),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_status", ["organizationId", "status"])
		.index("by_integration", ["integrationId"])
		.index("by_integration_reservation", [
			"integrationId",
			"otaReservationId",
		])
		.index("by_booking", ["bookingId"]),

	otaAvailabilityCache: defineTable({
		organizationId: orgId,
		otaProductId: v.id("otaProducts"),
		date: v.string(),
		availableSpaces: v.number(),
		totalSpaces: v.number(),
		timeSlots: jsonField,
		cachedAt: v.number(),
		expiresAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_product_date", ["otaProductId", "date"])
		.index("by_expires", ["expiresAt"]),

	otaRevenue: defineTable({
		organizationId: orgId,
		integrationId: v.id("otaIntegrations"),
		periodDate: v.string(),
		periodType: v.string(),
		totalBookings: v.number(),
		totalGuests: v.number(),
		grossRevenueCents: v.int64(),
		commissionPaidCents: v.int64(),
		netRevenueCents: v.optional(v.int64()),
		byTour: jsonField,
		calculatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_integration_period", [
			"organizationId",
			"integrationId",
			"periodDate",
			"periodType",
		])
		.index("by_integration_period", ["integrationId", "periodDate"]),

	// ----- Payments -----

	// Stripe PaymentIntent tracking + raw payment records.
	// stripePaymentIntentId is the only "encrypted" field that should NOT
	// be encrypted — it's needed in plaintext for Stripe webhook lookups.
	payments: defineTable({
		organizationId: orgId,
		bookingId: v.optional(v.id("bookings")),
		amountCents: v.int64(),
		currency,
		// PENDING | SUCCEEDED | FAILED | REFUNDED | CANCELLED
		status: v.string(),
		provider: v.string(),
		stripePaymentIntentId: v.string(),
		processedAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_status", ["organizationId", "status"])
		.index("by_stripe_intent", ["stripePaymentIntentId"])
		.index("by_booking", ["bookingId"]),

	// Per-organization Stripe config. Encrypted secrets.
	paymentSettings: defineTable({
		organizationId: orgId,
		stripeEnabled: v.boolean(),
		stripePublishableKey: v.string(),
		stripeSecretKey: encryptedString,
		stripeWebhookSecret: encryptedString,
		stripeIsSandbox: v.boolean(),
		acceptDeposits: v.boolean(),
		depositPercentage: v.number(), // 0..100
		defaultCurrency: currency,
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"]),

	// ----- Notifications -----

	notificationTemplates: defineTable({
		organizationId: orgId,
		name: v.string(),
		// booking_confirmation | reminder_24h | reminder_2h | reminder_1h |
		// post_tour_review | booking_cancelled | booking_modified |
		// payment_received | payment_failed | custom
		templateType: v.string(),
		// email | sms | both
		channel: v.string(),
		isActive: v.boolean(),
		isDefault: v.boolean(),
		emailSubject: v.string(),
		emailBodyText: v.string(),
		emailBodyHtml: v.string(),
		smsBody: v.string(),
		variables: v.array(v.string()),
		// immediate | 24h_before | 2h_before | 1h_before | post_tour | custom
		sendTiming: v.string(),
		timingValue: v.optional(v.number()),
		requireConsent: v.boolean(),
		retryOnFailure: v.boolean(),
		retryCount: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
		createdBy: v.optional(userId),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_type", ["organizationId", "templateType"])
		.index("by_org_active", ["organizationId", "isActive"]),

	smsMessages: defineTable({
		organizationId: orgId,
		bookingId: v.optional(v.id("bookings")),
		recipientPhone: v.string(),
		recipientName: v.string(),
		messageText: v.string(),
		templateId: v.optional(v.id("notificationTemplates")),
		// queued | sending | sent | delivered | failed | undelivered
		status: v.string(),
		twilioMessageSid: v.optional(v.string()),
		twilioStatus: v.optional(v.string()),
		// outbound | inbound
		direction: v.string(),
		costCents: v.int64(),
		currency,
		errorCode: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
		metadata: jsonField,
		scheduledAt: v.optional(v.number()),
		sentAt: v.optional(v.number()),
		deliveredAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_status", ["organizationId", "status"])
		.index("by_booking", ["bookingId"])
		.index("by_twilio_sid", ["twilioMessageSid"]),

	emailMessages: defineTable({
		organizationId: orgId,
		bookingId: v.optional(v.id("bookings")),
		recipientEmail: v.string(),
		recipientName: v.string(),
		subject: v.string(),
		bodyText: v.string(),
		bodyHtml: v.string(),
		templateId: v.optional(v.id("notificationTemplates")),
		// pending | sending | sent | failed | opened | clicked
		status: v.string(),
		resendMessageId: v.optional(v.string()),
		resendStatus: v.optional(v.string()),
		openedAt: v.optional(v.number()),
		clickedAt: v.optional(v.number()),
		errorCode: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
		metadata: jsonField,
		scheduledAt: v.optional(v.number()),
		sentAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_status", ["organizationId", "status"])
		.index("by_booking", ["bookingId"])
		.index("by_resend_id", ["resendMessageId"]),

	notificationLogs: defineTable({
		organizationId: orgId,
		bookingId: v.optional(v.id("bookings")),
		templateId: v.optional(v.id("notificationTemplates")),
		templateName: v.string(),
		// email | sms | whatsapp
		channel: v.string(),
		recipient: v.string(),
		// pending | sent | delivered | failed
		status: v.string(),
		errorMessage: v.optional(v.string()),
		scheduledFor: v.optional(v.number()),
		sentAt: v.optional(v.number()),
		metadata: jsonField,
		createdAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_status", ["organizationId", "status"])
		.index("by_booking", ["bookingId"])
		.index("by_org_channel", ["organizationId", "channel"])
		.index("by_created_at", ["createdAt"]),

	// Cron-driven: processPendingNotifications picks sent=false AND
	// scheduledFor<=now. Compound index on (sent, scheduledFor) makes
	// the query cheap.
	scheduledNotifications: defineTable({
		organizationId: orgId,
		bookingId: v.id("bookings"),
		templateId: v.id("notificationTemplates"),
		scheduledFor: v.number(),
		sent: v.boolean(),
		retryCount: v.number(),
		maxRetries: v.number(),
		notificationLogId: v.optional(v.id("notificationLogs")),
		createdAt: v.number(),
		processedAt: v.optional(v.number()),
	})
		.index("by_org", ["organizationId"])
		.index("by_booking_sent", ["bookingId", "sent"])
		.index("by_sent_scheduled", ["sent", "scheduledFor"])
		.index("by_org_scheduled", ["organizationId", "scheduledFor"]),

	notificationSettings: defineTable({
		organizationId: orgId,
		// Twilio
		twilioEnabled: v.boolean(),
		twilioAccountSid: v.optional(v.string()),
		twilioAuthToken: v.optional(encryptedString),
		twilioPhoneNumber: v.optional(v.string()),
		twilioMessagingServiceSid: v.optional(v.string()),
		// WhatsApp
		whatsappEnabled: v.boolean(),
		whatsappBusinessAccountId: v.optional(v.string()),
		whatsappPhoneNumberId: v.optional(v.string()),
		// Email (via SES)
		emailEnabled: v.boolean(),
		emailFromName: v.optional(v.string()),
		emailFromEmail: v.optional(v.string()),
		useCompanyDefaults: v.boolean(),
		requireSmsConsent: v.boolean(),
		requireEmailConsent: v.boolean(),
		maxRetries: v.number(),
		retryDelayMinutes: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org", ["organizationId"]),

	// ----- Audit & logs -----

	// Per-tenant audit log. Distinct from better-auth's securityAuditLog
	// (which is global / per-user). Source had two separate models.
	auditLogs: defineTable({
		organizationId: orgId,
		userId: v.optional(userId),
		action: v.string(), // e.g. "tour.created", "booking.confirmed"
		resourceType: v.string(), // e.g. "tour", "booking"
		resourceId: v.string(),
		oldValues: jsonField,
		newValues: jsonField,
		ipAddress: v.optional(v.string()),
		userAgent: v.optional(v.string()),
		timestamp: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_timestamp", ["organizationId", "timestamp"])
		.index("by_user", ["userId"])
		.index("by_resource", ["resourceType", "resourceId"]),

	// ----- Files (Convex storage metadata) -----

	// Generic uploaded file metadata. Not a port from source (source uses
	// Cloudinary URLs directly) but a Convex-native replacement. Files
	// live in _storage; this table is for queryable metadata.
	files: defineTable({
		organizationId: orgId,
		storageId: v.id("_storage"),
		filename: v.string(),
		contentType: v.string(),
		size: v.number(),
		// "tour-image" | "customer-doc" | "tour-doc" | ...
		purpose: v.string(),
		uploadedBy: v.optional(userId),
		createdAt: v.number(),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_purpose", ["organizationId", "purpose"])
		.index("by_uploader", ["uploadedBy"]),

	// ----- Public booking attempts (rate limit + audit) -----
	//
	// One row per POST /api/public/book/:slug attempt. Used by
	// convex/lib/rate_limit.ts to enforce a per-email cap on
	// unauthenticated booking submissions (5 / 15min by default).
	// Cron cleanup deletes rows older than the window.
	//
	// organizationId is set only when the slug resolves to a real org
	// — failed lookups (unknown slug) still record so attackers can't
	// spray arbitrary slugs.

	publicBookingAttempts: defineTable({
		organizationId: v.optional(orgId),
		email: v.string(),
		// success | rejected_unknown_slug | rejected_rate_limit |
		// rejected_validation | rejected_capacity
		outcome: v.string(),
		slug: v.string(),
		createdAt: v.number(),
	})
		.index("by_email_created", ["email", "createdAt"])
		.index("by_org_created", ["organizationId", "createdAt"])
		.index("by_created", ["createdAt"]),
});
