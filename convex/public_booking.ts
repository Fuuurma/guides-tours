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
// Rate-limit / CAPTCHA is a Cloudflare concern (not in Convex).

import { v, ConvexError } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { components, internal } from "./_generated/api";

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
			tourId: args.tourId,
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
		const tour = await ctx.db.get(args.tourId as never);
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
			tourId: args.tourId as never,
			customerId: customerId as never,
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

		await ctx.db.insert("auditLogs", {
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
			timestamp: now,
		});

		return bookingId;
	},
});

