// Shared OTA upsert logic.
//
// All 7 providers' webhook handlers normalize their payloads and
// then call these helpers to write to otaBookings / otaAvailabilityCache.
// Keeping the upsert logic centralized means:
//   - one place to fix normalization bugs
//   - one place to add audit logs
//   - one place to enforce the unique constraint (integrationId +
//     otaReservationId per source)

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Upsert an OTA booking. Called by every provider's webhook handler
 * after normalizing their payload. Idempotent: re-running for the
 * same (integrationId, reservationId) updates rather than inserts.
 */
export const upsertOtaBooking = internalMutation({
	args: {
		integrationId: v.id("otaIntegrations"),
		organizationId: v.string(),
		provider: v.string(),
		event: v.object({
			kind: v.literal("booking.created"),
			reservationId: v.string(),
			productId: v.string(),
			customerName: v.string(),
			customerEmail: v.string(),
			customerPhone: v.optional(v.string()),
			customerCountry: v.optional(v.string()),
			tourDate: v.string(),
			tourTime: v.optional(v.string()),
			guests: v.number(),
			totalPaidCents: v.optional(v.int64()),
			currency: v.optional(v.string()),
			commissionRate: v.optional(v.number()),
			commissionCents: v.optional(v.int64()),
			rawPayload: v.any(),
		}),
		rawData: v.any(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const { event, integrationId, organizationId, rawData } = args;

		// Find the matching OTA product. If we can't link the reservation
		// to one of our products, we still store the booking as
		// "unmatched" — admin can resolve later.
		const products = await ctx.db
			.query("otaProducts")
			.withIndex("by_integration", (q) => q.eq("integrationId", integrationId))
			.collect();
		const product = products.find(
			(p) => p.otaProductId === event.productId,
		);

		const existing = await ctx.db
			.query("otaBookings")
			.withIndex("by_integration_reservation", (q) =>
				q
					.eq("integrationId", integrationId)
					.eq("otaReservationId", event.reservationId),
			)
			.unique();

		const patch = {
			organizationId,
			integrationId,
			otaReservationId: event.reservationId,
			otaCustomerName: event.customerName,
			otaCustomerEmail: event.customerEmail,
			otaCustomerPhone: event.customerPhone,
			otaCustomerCountry: event.customerCountry,
			otaCustomerData: {
				productId: event.productId,
				guests: event.guests,
			},
			otaTourName: product?.otaTitle ?? event.productId,
			otaTourDate: event.tourDate,
			otaTourTime: event.tourTime,
			otaGuests: event.guests,
			otaTotalPaidCents: event.totalPaidCents,
			otaCurrency: event.currency ?? "USD",
			commissionRate: event.commissionRate ?? product?.commissionRate,
			commissionAmountCents: event.commissionCents,
			netRevenueCents: event.totalPaidCents
				? event.commissionCents
					? event.totalPaidCents - event.commissionCents
					: event.totalPaidCents
				: undefined,
			status: "confirmed" as const,
			lastSyncAt: now,
			rawOtaData: rawData,
			confirmedAt: now,
		};

		if (existing) {
			await ctx.db.patch(existing._id, patch);
			return { id: existing._id, created: false };
		}

		const id = await ctx.db.insert("otaBookings", {
			...patch,
			bookingId: undefined,
			otaOrderNumber: undefined,
			otaConfirmationCode: undefined,
			rawOtaData: rawData,
			receivedAt: now,
		});
		return { id, created: true };
	},
});

export const cancelOtaBooking = internalMutation({
	args: {
		integrationId: v.id("otaIntegrations"),
		reservationId: v.string(),
		rawData: v.any(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("otaBookings")
			.withIndex("by_integration_reservation", (q) =>
				q
					.eq("integrationId", args.integrationId)
					.eq("otaReservationId", args.reservationId),
			)
			.unique();
		if (!existing) return null;
		const now = Date.now();
		await ctx.db.patch(existing._id, {
			status: "cancelled",
			cancelledAt: now,
			lastSyncAt: now,
			rawOtaData: args.rawData,
		});
		return existing._id;
	},
});

export const upsertAvailabilityCache = internalMutation({
	args: {
		integrationId: v.id("otaIntegrations"),
		event: v.object({
			kind: v.literal("availability.update"),
			productId: v.string(),
			date: v.string(),
			availableSpaces: v.number(),
			totalSpaces: v.number(),
			rawPayload: v.any(),
		}),
	},
	handler: async (ctx, args) => {
		const products = await ctx.db
			.query("otaProducts")
			.withIndex("by_integration", (q) =>
				q.eq("integrationId", args.integrationId),
			)
			.collect();
		const product = products.find(
			(p) => p.otaProductId === args.event.productId,
		);
		if (!product) return null;

		const now = Date.now();
		const existing = await ctx.db
			.query("otaAvailabilityCache")
			.withIndex("by_product_date", (q) =>
				q
					.eq("otaProductId", product._id)
					.eq("date", args.event.date),
			)
			.unique();

		const expiresAt = now + 15 * 60_000;
		const doc = {
			organizationId: product.organizationId,
			otaProductId: product._id,
			date: args.event.date,
			availableSpaces: args.event.availableSpaces,
			totalSpaces: args.event.totalSpaces,
			timeSlots: [],
			cachedAt: now,
			expiresAt,
		};
		if (existing) {
			await ctx.db.patch(existing._id, doc);
			return existing._id;
		}
		return await ctx.db.insert("otaAvailabilityCache", doc);
	},
});

/**
 * Resolve a webhook's `organizationId` from the integration record.
 * Cheap and shared so providers don't have to re-implement it.
 */
export const resolveOrganizationForIntegration = internalMutation({
	args: { integrationId: v.id("otaIntegrations") },
	handler: async (ctx, args) => {
		const integration = await ctx.db.get(args.integrationId);
		if (!integration) return null;
		return {
			organizationId: integration.organizationId,
			provider: integration.provider,
		};
	},
});
