// Public booking endpoint (no auth required).
//
// Source: backend/tours/routers/public.py::create_public_booking
//         backend/tours/services/booking_service.py::create_public_booking
//                         ::get_or_create_customer
//
// Reachable at POST /api/public/book/:slug from any unauthenticated
// visitor. The slug identifies the organization, and the email
// identifies the customer within it.
//
// Pattern:
//   1. Resolve organization by slug (via Better Auth component's
//      exposed adapter query)
//   2. Validate tour is active + has capacity
//   3. Get-or-create customer by email within that org
//   4. Create booking in "confirmed" state
//
// Rate-limit lives in Convex (lib/rate_limit.ts). CAPTCHA is a
// Cloudflare concern if needed.

import { v, ConvexError } from "convex/values";
import { internalAction, internalMutation, query } from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { FunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { parseBookingTime } from "./lib/time";
import { logAudit } from "./lib/audit";
import { isBlackoutHelper } from "./tourBlackoutDates";
import {
	assertValidCustomerInput,
	normalizeEmail,
} from "./lib/validation";

const COLLECTIBLE_PUBLIC = new Set(["pending", "confirmed", "checked_in"]);

// ----- Public query: org + active tours by slug -----
//
// Used by the public booking page (no auth required) to render the
// tour picker. Returns only the fields the form needs — never the
// org's internal IDs or staff data.

export const getOrgAndToursBySlug = query({
	args: { slug: v.string() },
	handler: async (ctx, args) => {
		const org = (await ctx.runQuery(
			components.betterAuth.adapter.findOne as never,
			{
				model: "organization" as never,
				where: [{ field: "slug", value: args.slug }] as never,
			},
		)) as { id?: string; name?: string } | null;
		if (!org?.id) return null;

		// by_org_active leads with (org, isActive) so inactive tours
		// are skipped at the index level instead of fetched + filtered.
		const tours = await ctx.db
			.query("tours")
			.withIndex("by_org_active", (q) =>
				q
					.eq("organizationId", org.id as string)
					.eq("isActive", true),
			)
			.collect();

		return {
			organizationId: org.id,
			organizationName: org.name ?? "Tour operator",
			tours: tours.map((t) => ({
				_id: t._id,
				name: t.name,
				description: t.description,
				tourType: t.tourType,
				durationHours: t.durationHours,
				capacity: t.capacity,
				maxGuests: t.maxGuests,
				currency: t.currency,
				basePriceCents: t.basePriceCents,
				languages: t.languages,
			})),
		};
	},
});

/**
 * Public slot picker: available schedules for a tour on a date,
 * with remaining capacity. No auth — slug scopes to the org.
 */
export const listAvailableSlots = query({
	args: {
		slug: v.string(),
		tourId: v.id("tours"),
		date: v.string(),
	},
	handler: async (ctx, args) => {
		const org = (await ctx.runQuery(
			components.betterAuth.adapter.findOne as never,
			{
				model: "organization" as never,
				where: [{ field: "slug", value: args.slug }] as never,
			},
		)) as { id?: string } | null;
		if (!org?.id) return [];

		const tour = await ctx.db.get(args.tourId);
		if (!tour || tour.organizationId !== org.id || !tour.isActive) {
			return [];
		}

		const blackedOut = await isBlackoutHelper(ctx, args.tourId, args.date);
		if (blackedOut) return [];

		const schedules = await ctx.db
			.query("tourSchedules")
			.withIndex("by_tour_date", (q) =>
				q.eq("tourId", args.tourId).eq("date", args.date),
			)
			.collect();

		const nowMs = Date.now();
		const cutoffMs = (tour.bookingCutoffHours ?? 0) * 3_600_000;

		return schedules
			.filter((s) => {
				if (s.organizationId !== org.id) return false;
				if (s.status !== "available") return false;
				if (s.capacityBooked >= s.capacityTotal) return false;
				const tourTs = parseBookingTime(s.date, s.startTime);
				if (tourTs === null || tourTs <= nowMs) return false;
				if (cutoffMs > 0 && tourTs - nowMs < cutoffMs) return false;
				return true;
			})
			.map((s) => ({
				_id: s._id,
				startTime: s.startTime,
				endTime: s.endTime,
				capacityTotal: s.capacityTotal,
				capacityBooked: s.capacityBooked,
				seatsLeft: s.capacityTotal - s.capacityBooked,
			}))
			.sort((a, b) => a.startTime.localeCompare(b.startTime));
	},
});

// ----- Action: slug → orgId, then create booking -----
//
// We use an action (not httpAction) so we can call the Better Auth
// component's exposed adapter query, and so future phases can add
// SES email sending inside the same function. The HTTP handler in
// convex/http.ts is a thin wrapper.

export const createForSlug: ReturnType<typeof internalAction> = internalAction({
	args: {
		slug: v.string(),
		tourId: v.id("tours"),
		customerName: v.string(),
		customerEmail: v.string(),
		customerPhone: v.optional(v.string()),
		date: v.string(),
		startTime: v.string(),
		guests: v.number(),
		notes: v.optional(v.string()),
		scheduleId: v.optional(v.id("tourSchedules")),
		emailConsent: v.optional(v.boolean()),
		smsConsent: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		// Rate-limit check (per-email). Recorded BEFORE the slug
		// lookup so an attacker can't burn through unknown slugs
		// without consuming their email's quota.
		// Cast via FunctionReference since the generated internal
		// type strips lib/ subdirectory modules (those containing
		// query/mutation exports). Same pattern as ota/integrations.
		const recordAttemptRef = (internal as unknown as {
			"lib/rate_limit": {
				recordAttempt: FunctionReference<
					"mutation",
					"internal",
					{
						email: string;
						slug: string;
						organizationId: string | undefined;
						outcome: string;
					},
					{ allowed: boolean; attempts: number; attemptId: Id<"publicBookingAttempts"> }
				>;
				updateAttemptOutcome: FunctionReference<
					"mutation",
					"internal",
					{
						attemptId: Id<"publicBookingAttempts">;
						outcome: string;
						organizationId?: string;
					},
					{ updated: boolean }
				>;
			};
		})["lib/rate_limit"];
		const rateCheck = await ctx.runMutation(recordAttemptRef.recordAttempt, {
			email: args.customerEmail,
			slug: args.slug,
			organizationId: undefined,
			outcome: "pending",
		});
		if (!rateCheck.allowed) {
			throw new ConvexError(
				`rate limit exceeded: try again later (${rateCheck.attempts} attempts in window)`,
			);
		}

		// Resolve organization via Better Auth component adapter query.
		// `model: "organization"` is added at runtime by the org plugin;
		// the static type only includes the default tables, so we cast.
		const org = (await ctx.runQuery(
			components.betterAuth.adapter.findOne as never,
			{
				model: "organization" as never,
				where: [
					{ field: "slug", value: args.slug },
				] as never,
			},
		)) as { id?: string } | null;
		if (!org) {
			await ctx.runMutation(recordAttemptRef.updateAttemptOutcome, {
				attemptId: rateCheck.attemptId,
				outcome: "failure_org_not_found",
			});
			throw new ConvexError("organization not found");
		}
		const organizationId = org.id;
		if (!organizationId) {
			await ctx.runMutation(recordAttemptRef.updateAttemptOutcome, {
				attemptId: rateCheck.attemptId,
				outcome: "failure_org_no_id",
			});
			throw new ConvexError("organization has no id");
		}

		try {
			const bookingId = await ctx.runMutation(
				internal.public_booking.internalCreate,
				{
					organizationId,
					tourId: args.tourId,
					customerName: args.customerName,
					customerEmail: args.customerEmail,
					customerPhone: args.customerPhone,
					date: args.date,
					startTime: args.startTime,
					guests: args.guests,
					notes: args.notes,
					scheduleId: args.scheduleId,
					emailConsent: args.emailConsent,
					smsConsent: args.smsConsent,
				},
			);
			await ctx.runMutation(recordAttemptRef.updateAttemptOutcome, {
				attemptId: rateCheck.attemptId,
				outcome: "success",
				organizationId,
			});

			const checkout = await ctx.runQuery(
				internal.payments.getBookingForCheckout,
				{ bookingId },
			);
			const settings = await ctx.runQuery(
				internal.payments.getStripeSecrets,
				{ organizationId },
			);
			const balanceDueCents = checkout?.balanceDueCents ?? 0n;
			const canPay =
				Boolean(settings?.stripeEnabled && settings.stripeSecretKey) &&
				balanceDueCents > 0n &&
				COLLECTIBLE_PUBLIC.has(checkout?.status ?? "");

			return {
				bookingId,
				status: "confirmed" as const,
				balanceDueCents: balanceDueCents.toString(),
				canPay,
				stripePublishableKey:
					canPay && settings?.stripePublishableKey
						? settings.stripePublishableKey
						: undefined,
			};
		} catch (err) {
			await ctx.runMutation(recordAttemptRef.updateAttemptOutcome, {
				attemptId: rateCheck.attemptId,
				outcome: `failure_${err instanceof ConvexError ? err.data : "unknown"}`,
				organizationId,
			});
			throw err;
		}
	},
});

// ----- Internal mutation: get-or-create customer + create booking -----
//
// We inline the get-or-create inside the mutation rather than factoring
// it out — keeping it as a `ctx` parameter creates a type mismatch
// with the real Convex `MutationCtx`.

export const internalCreate = internalMutation({
	args: {
		organizationId: v.string(),
		tourId: v.id("tours"),
		customerName: v.string(),
		customerEmail: v.string(),
		customerPhone: v.optional(v.string()),
		date: v.string(),
		startTime: v.string(),
		guests: v.number(),
		notes: v.optional(v.string()),
		scheduleId: v.optional(v.id("tourSchedules")),
		emailConsent: v.optional(v.boolean()),
		smsConsent: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		// Normalize + validate email via the shared helper. Rejects
		// invalid shapes AND overlong addresses (>254 chars) before
		// they hit the customers table. Mirrors FE's EMAIL_REGEX +
		// MAX_EMAIL_LEN in src/lib/validation.ts.
		const normalizedEmail = normalizeEmail(args.customerEmail);
		if (!normalizedEmail) {
			throw new ConvexError("Invalid email address");
		}

		// Length validation on customer-supplied free-text fields. The
		// FE validates these too (maxLength on the inputs), but the
		// public endpoint is reachable by anyone — defending in depth
		// here prevents a 10MB customer name from being inserted if
		// someone hits the action directly.
		const validInput = assertValidCustomerInput({
			name: args.customerName,
			notes: args.notes,
			phone: args.customerPhone,
		});

		const tour = await ctx.db.get(args.tourId);
		if (!tour) throw new ConvexError("Tour not found");
		if (tour.organizationId !== args.organizationId) {
			throw new ConvexError("Tour not found");
		}
		if (!tour.isActive) {
			throw new ConvexError("Tour is not active");
		}
		if (args.guests <= 0) {
			throw new ConvexError("guests must be > 0");
		}
		if (tour.maxGuests && args.guests > tour.maxGuests) {
			throw new ConvexError(
				`Guest count exceeds tour maximum of ${tour.maxGuests}`,
			);
		}

		// Resolve schedule: explicit id, else (tour, date, startTime).
		// When a concrete schedule exists we always attach + capacity.
		let scheduleId = args.scheduleId;
		let date = args.date;
		let startTime = args.startTime;
		if (scheduleId) {
			const schedule = await ctx.db.get(scheduleId);
			if (!schedule || schedule.organizationId !== args.organizationId) {
				throw new ConvexError("Schedule not found");
			}
			if (schedule.tourId !== args.tourId) {
				throw new ConvexError("Schedule does not belong to the specified tour");
			}
			if (schedule.status === "cancelled") {
				throw new ConvexError("Cannot book a cancelled schedule");
			}
			date = schedule.date;
			startTime = schedule.startTime;
		} else {
			const match = await ctx.db
				.query("tourSchedules")
				.withIndex("by_tour_date_start", (q) =>
					q
						.eq("tourId", args.tourId)
						.eq("date", args.date)
						.eq("startTime", args.startTime),
				)
				.unique();
			if (match && match.organizationId === args.organizationId) {
				if (match.status === "cancelled") {
					throw new ConvexError("Cannot book a cancelled schedule");
				}
				scheduleId = match._id;
			}
		}

		// Reject past dates and dates that fall inside the
		// bookingCutoffHours window (operator-defined lead time).
		const tourTs = parseBookingTime(date, startTime);
		if (tourTs === null) {
			throw new ConvexError(`Invalid date or time: "${date} ${startTime}"`);
		}
		const nowMs = Date.now();
		if (tourTs <= nowMs) {
			throw new ConvexError(
				"Cannot book a tour in the past or starting within the next minute",
			);
		}
		const cutoffMs = tour.bookingCutoffHours ?? 0;
		if (cutoffMs > 0 && tourTs - nowMs < cutoffMs * 3_600_000) {
			throw new ConvexError(
				`Bookings must be made at least ${cutoffMs}h before the tour`,
			);
		}

		// Reject if the operator has marked this tour/date as blacked out.
		const blackedOut = await isBlackoutHelper(ctx, args.tourId, date);
		if (blackedOut) {
			throw new ConvexError(
				"This date is not available for booking. Please pick another date.",
			);
		}

		const emailConsent = args.emailConsent === true;
		const smsConsent = args.smsConsent === true;

		const existing = await ctx.db
			.query("customers")
			.withIndex("by_org_email", (q) =>
				q
					.eq("organizationId", args.organizationId)
					.eq("email", normalizedEmail),
			)
			.unique();

		const now = Date.now();
		let customerId = existing?._id;
		if (customerId && existing) {
			const patch: {
				updatedAt: number;
				smsConsent?: boolean;
				emailConsent?: boolean;
				smsConsentDate?: number;
				emailConsentDate?: number;
				phone?: string;
				name?: string;
			} = { updatedAt: now };
			if (emailConsent && !existing.emailConsent) {
				patch.emailConsent = true;
				patch.emailConsentDate = now;
			}
			if (smsConsent && !existing.smsConsent) {
				patch.smsConsent = true;
				patch.smsConsentDate = now;
			}
			if (validInput.phone && !existing.phone) {
				patch.phone = validInput.phone;
			}
			if (Object.keys(patch).length > 1) {
				await ctx.db.patch(customerId, patch);
			}
		} else {
			customerId = await ctx.db.insert("customers", {
				organizationId: args.organizationId,
				name: validInput.name,
				email: normalizedEmail,
				phone: validInput.phone,
				notes: validInput.notes,
				smsConsent,
				emailConsent,
				smsConsentDate: smsConsent ? now : undefined,
				emailConsentDate: emailConsent ? now : undefined,
				preferredLanguage: "en",
				tags: [],
				source: "public_booking",
				sourceDetails: "Public website booking flow",
				specialRequirements: "",
				vipStatus: false,
				loyaltyPoints: 0,
				totalVisits: 0,
				totalRevenueCents: 0n,
				createdAt: now,
				updatedAt: now,
			});
		}

		const unitPrice = tour.basePriceCents ?? 0n;
		const totalAmountCents = unitPrice * BigInt(args.guests);

		if (!customerId) {
			throw new ConvexError("Failed to resolve customer");
		}

		const bookingId = await ctx.db.insert("bookings", {
			organizationId: args.organizationId,
			tourId: args.tourId,
			scheduleId,
			customerId,
			date,
			startTime,
			guests: args.guests,
			guestNames: "",
			languageRequired: "",
			notes: validInput.notes,
			status: "confirmed",
			depositAmountCents: 0n,
			totalAmountCents,
			balanceDueCents: totalAmountCents,
			paymentMethod: "",
			checkedInAt: undefined,
			checkedInBy: "",
			completedAt: undefined,
			netRevenueCents: totalAmountCents,
			source: "public_booking",
			reviewRating: undefined,
			reviewComment: "",
			createdAt: now,
			updatedAt: now,
		});

		if (scheduleId) {
			await ctx.runMutation(
				internal.tourSchedules.incrementBooked as unknown as Parameters<
					typeof ctx.runMutation
				>[0],
				{
					organizationId: args.organizationId,
					scheduleId,
					guests: args.guests,
				},
			);
		}

		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: "anonymous",
			action: "booking.created_public",
			resourceType: "booking",
			resourceId: bookingId,
			oldValues: {},
			newValues: {
				tourId: args.tourId,
				customerEmail: args.customerEmail,
				date,
				startTime,
				scheduleId,
				guests: args.guests,
				source: "public_booking",
			},
		});

		// Send an immediate booking-confirmation email/SMS using
		// the org's active `booking_confirmation` template. Same
		// path as the dashboard create flow — best-effort.
		await ctx.scheduler.runAfter(
			0,
			internal.notification_dispatch.dispatchImmediateBookingConfirmation as unknown as Parameters<
				typeof ctx.scheduler.runAfter
			>[2],
			{ bookingId },
		);

		// Schedule reminder notifications (24h + 2h before tour).
		await ctx.runMutation(
			internal.scheduledNotifications.scheduleForBooking,
			{
				organizationId: args.organizationId,
				bookingId,
				date: args.date,
				startTime: args.startTime,
			},
		);

		return bookingId;
	},
});

