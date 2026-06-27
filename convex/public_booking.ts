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
import { parseBookingTime } from "./lib/time";
import { logAudit } from "./lib/audit";

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

		const tours = await ctx.db
			.query("tours")
			.withIndex("by_org", (q) =>
				q.eq("organizationId", org.id as string),
			)
			.filter((q) => q.eq(q.field("isActive"), true))
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

// ----- Action: slug → orgId, then create booking -----
//
// We use an action (not httpAction) so we can call the Better Auth
// component's exposed adapter query, and so future phases can add
// SES email sending inside the same function. The HTTP handler in
// convex/http.ts is a thin wrapper.

export const createForSlug: ReturnType<typeof internalAction> = internalAction({
	args: {
		slug: v.string(),
		tourId: v.string(),
		customerName: v.string(),
		customerEmail: v.string(),
		customerPhone: v.optional(v.string()),
		date: v.string(),
		startTime: v.string(),
		guests: v.number(),
		notes: v.optional(v.string()),
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
					{ allowed: boolean; attempts: number }
				>;
			};
		})["lib/rate_limit"].recordAttempt;
		const rateCheck = await ctx.runMutation(recordAttemptRef, {
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
			throw new ConvexError("organization not found");
		}
		const organizationId = org.id;
		if (!organizationId) {
			throw new ConvexError("organization has no id");
		}

		return await ctx.runMutation(internal.public_booking.internalCreate, {
			organizationId,
			tourId: args.tourId as never,
			customerName: args.customerName,
			customerEmail: args.customerEmail,
			customerPhone: args.customerPhone,
			date: args.date,
			startTime: args.startTime,
			guests: args.guests,
			notes: args.notes,
		});
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
	},
	handler: async (ctx, args) => {
		const tour = await ctx.db.get(args.tourId);
		if (!tour) throw new ConvexError("Tour not found");
		if (
			(tour as { organizationId: string }).organizationId !==
			args.organizationId
		) {
			throw new ConvexError("Tour not found");
		}
		if (!(tour as { isActive: boolean }).isActive) {
			throw new ConvexError("Tour is not active");
		}
		// Reject past dates and dates that fall inside the
		// bookingCutoffHours window (operator-defined lead time).
		// parseBookingTime returns a UTC timestamp for the tour start,
		// or null if the date/time is malformed.
		const tourTs = parseBookingTime(args.date, args.startTime);
		if (tourTs === null) {
			throw new ConvexError(
				`Invalid date or time: "${args.date} ${args.startTime}"`,
			);
		}
		const nowMs = Date.now();
		if (tourTs <= nowMs) {
			throw new ConvexError(
				"Cannot book a tour in the past or starting within the next minute",
			);
		}
		const cutoffMs =
			(tour as { bookingCutoffHours?: number }).bookingCutoffHours ?? 0;
		if (cutoffMs > 0 && tourTs - nowMs < cutoffMs * 3_600_000) {
			throw new ConvexError(
				`Bookings must be made at least ${cutoffMs}h before the tour`,
			);
		}
		if (args.guests <= 0) {
			throw new ConvexError("guests must be > 0");
		}
		const max = (tour as { maxGuests?: number }).maxGuests;
		if (max && args.guests > max) {
			throw new ConvexError(
				`Guest count exceeds tour maximum of ${max}`,
			);
		}

		const existing = await ctx.db
			.query("customers")
			.withIndex("by_org_email", (q) =>
				q.eq("organizationId", args.organizationId).eq("email", args.customerEmail),
			)
			.unique();

		const now = Date.now();
		const customerId =
			existing?._id ??
			(await ctx.db.insert("customers", {
				organizationId: args.organizationId,
				name: args.customerName,
				email: args.customerEmail,
				phone: args.customerPhone ?? "",
				notes: args.notes ?? "",
				// Source default: False for both consent fields
				// (models.py:891-892). The public booking form should
				// collect explicit consent before flipping these on.
				smsConsent: false,
				emailConsent: false,
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
			}));

		const bookingId = await ctx.db.insert("bookings", {
			organizationId: args.organizationId,
			tourId: args.tourId,
			customerId,
			date: args.date,
			startTime: args.startTime,
			guests: args.guests,
			guestNames: "",
			languageRequired: "",
			notes: args.notes ?? "",
			status: "confirmed",
			depositAmountCents: 0n,
			totalAmountCents: 0n,
			balanceDueCents: 0n,
			paymentMethod: "",
			checkedInAt: undefined,
			checkedInBy: "",
			completedAt: undefined,
			netRevenueCents: 0n,
			source: "public_booking",
			reviewRating: undefined,
			reviewComment: "",
			createdAt: now,
			updatedAt: now,
		});

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
				date: args.date,
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

