// Shared OTA upsert logic.
//
// All 7 providers' webhook handlers normalize their payloads and
// then call these helpers to write to otaBookings / otaAvailabilityCache.
// Keeping the upsert logic centralized means:
//   - one place to fix normalization bugs
//   - one place to add audit logs
//   - one place to enforce the unique constraint (integrationId +
//     otaReservationId per source)

import { v, ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { logAudit } from "../lib/audit";

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
			productId: v.optional(v.string()),
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

		// SECURITY: the caller's organizationId is the canonical
		// source of truth (it came from the resolved integration in
		// the webhook handler). Verify the integration actually
		// belongs to this org before writing a row — otherwise a
		// forged orgId from any internal caller could cross-tenant.
		const integration = await ctx.db.get(integrationId);
		if (!integration) {
			throw new ConvexError("OTA integration not found");
		}
		if (integration.organizationId !== organizationId) {
			throw new ConvexError(
				"organizationId does not match OTA integration",
			);
		}

		// Find the matching OTA product. If we can't link the reservation
		// to one of our products, we still store the booking as
		// "unmatched" — admin can resolve later.
		const product = event.productId
			? await ctx.db
					.query("otaProducts")
					.withIndex("by_integration_product", (q) =>
						q
							.eq("integrationId", integrationId)
							.eq("otaProductId", event.productId!),
					)
					.first()
			: null;

		const existing = await ctx.db
			.query("otaBookings")
			.withIndex("by_integration_reservation", (q) =>
				q
					.eq("integrationId", integrationId)
					.eq("otaReservationId", event.reservationId),
			)
			.unique();

		// Compute commission + net revenue.
		// Some OTAs send only commissionRate, others send only
		// commissionCents, some both, some neither. Derive a single
		// source of truth per row.
		// Clamp rate to [0, 1] — a rate above 100% would produce
		// negative net revenue (paid − commission). Bad config or a
		// buggy provider response shouldn't silently flip net revenue
		// below zero.
		const rawRate = event.commissionRate ?? product?.commissionRate ?? 0;
		const rate = Math.max(0, Math.min(rawRate, 1));
		const paidCents = event.totalPaidCents;
		// F361: guests drives capacityBooked — non-positive/fractional
		// values would take the decrement branch in applyOtaCapacity or
		// store a fractional seat claim. Floor and floor-at-1.
		if (!Number.isFinite(event.guests)) {
			throw new ConvexError("guests must be a finite number");
		}
		const guests = Math.max(1, Math.floor(event.guests));
		if (guests !== event.guests) {
			console.warn(
				`ota guests: clamping ${event.guests} → ${guests} for ${event.reservationId}`,
			);
		}
		let commissionCents = event.commissionCents;
		if (commissionCents === undefined && paidCents !== undefined && rate > 0) {
			// Derive from rate × totalPaid, rounded to whole cents.
			// Use BigInt arithmetic to avoid floating-point loss.
			commissionCents =
				(BigInt(Math.round(rate * 1_000_000)) * paidCents) / 1_000_000n;
		}
		// F397: explicit commissionCents is not rate-clamped — a signed
		// payload with commissionCents > totalPaidCents would store a
		// negative net. Clamp commission into [0, paid] so the
		// net ≥ 0 invariant holds regardless of source.
		if (commissionCents !== undefined && paidCents !== undefined) {
			if (commissionCents < 0n) {
				console.warn(
					`ota commission: clamping negative ${commissionCents} → 0 for ${event.reservationId}`,
				);
				commissionCents = 0n;
			} else if (commissionCents > paidCents) {
				console.warn(
					`ota commission: clamping ${commissionCents} > paid ${paidCents} → paid for ${event.reservationId}`,
				);
				commissionCents = paidCents;
			}
		}
		const netRevenueCents =
			paidCents !== undefined
				? commissionCents !== undefined
					? paidCents - commissionCents
					: paidCents
				: undefined;

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
				guests,
			},
			otaTourName: product?.otaTitle ?? event.productId,
			otaTourDate: event.tourDate,
			otaTourTime: event.tourTime,
			otaGuests: guests,
			otaTotalPaidCents: paidCents,
			otaCurrency: event.currency ?? "USD",
			commissionRate: rate,
			commissionAmountCents: commissionCents,
			netRevenueCents,
			status: "confirmed" as const,
			lastSyncAt: now,
			rawOtaData: rawData,
		};

		// F331: resolve the departure this reservation consumes capacity
		// on, so OTA-sold seats stop being double-sold on the public
		// booking picker. Unresolved (no product match, ambiguous
		// same-day departures, missing tourDate) leaves scheduleId unset
		// and the row ingest-only.
		const schedule = product?.tourId
			? await resolveOtaSchedule(
					ctx,
					organizationId,
					product.tourId,
					event.tourDate,
					event.tourTime,
				)
			: null;
		const scheduleId = schedule?._id;

		if (existing) {
			// A re-delivered/re-emitted BOOKING_CREATED for a previously
			// cancelled reservation re-confirms it: clear the stale
			// cancelledAt so the row isn't left in an inconsistent
			// confirmed+cancelledAt state. The audit row below records
			// the cancelled→confirmed transition via oldValues.
			// Prefer a freshly resolved schedule; otherwise keep the
			// existing link (F396 — a resolve miss must not drop it).
			const effectiveScheduleId = scheduleId ?? existing.scheduleId;
			const isReconfirm = existing.status === "cancelled";
			const patchToApply = isReconfirm
				? {
						...patch,
						cancelledAt: undefined,
						scheduleId: effectiveScheduleId,
						confirmedAt: now,
					}
				: {
						...patch,
						scheduleId: effectiveScheduleId,
						// F360: plain re-dispatch keeps the original stamp.
						confirmedAt: existing.confirmedAt ?? now,
					};

			// Capacity bookkeeping. A cancelled row holds no seats, so a
			// re-confirm re-adds the full guest count; a confirmed re-upsert
			// only corrects deltas (schedule move or guest-count change).
			// F396: when resolve misses but the row still holds a prior
			// schedule + guest delta, correct that prior schedule — the
			// stored otaGuests changes either way.
			if (isReconfirm) {
				if (effectiveScheduleId) {
					await applyOtaCapacity(ctx, organizationId, effectiveScheduleId, guests);
				}
			} else {
				const priorSchedule = existing.scheduleId;
				const priorGuests = existing.otaGuests;
				if (effectiveScheduleId && effectiveScheduleId !== priorSchedule) {
					if (priorSchedule) {
						await applyOtaCapacity(ctx, organizationId, priorSchedule, -priorGuests);
					}
					await applyOtaCapacity(ctx, organizationId, effectiveScheduleId, guests);
				} else if (
					effectiveScheduleId &&
					effectiveScheduleId === priorSchedule &&
					guests !== priorGuests
				) {
					// Same link (fresh resolve or prior kept on resolve
					// miss) + guest delta — correct the seat count.
					await applyOtaCapacity(
						ctx,
						organizationId,
						effectiveScheduleId,
						guests - priorGuests,
					);
				}
			}

			await ctx.db.patch(existing._id, patchToApply);
			await logAudit(ctx, {
				organizationId,
				userId: "system",
				action: "ota_booking.updated",
				resourceType: "otaBooking",
				resourceId: existing._id,
				oldValues: { status: existing.status },
				// PII: don't log customer name/email/phone.
				newValues: {
					reservationId: event.reservationId,
					tourDate: event.tourDate,
					guests,
					status: "confirmed",
				},
			});
			return { id: existing._id, created: false };
		}

		if (scheduleId) {
			await applyOtaCapacity(ctx, organizationId, scheduleId, guests);
		}
		const id = await ctx.db.insert("otaBookings", {
			...patch,
			scheduleId,
			confirmedAt: now,
			bookingId: undefined,
			otaOrderNumber: undefined,
			otaConfirmationCode: undefined,
			rawOtaData: rawData,
			receivedAt: now,
		});
		await logAudit(ctx, {
			organizationId,
			userId: "system",
			action: "ota_booking.created",
			resourceType: "otaBooking",
			resourceId: id,
			oldValues: {},
			// PII: don't log customer name/email/phone.
			newValues: {
				reservationId: event.reservationId,
				tourDate: event.tourDate,
				guests,
				status: "confirmed",
			},
		});
		return { id, created: true };
	},
});

/**
 * Resolve the tourSchedules departure an OTA reservation consumes
 * capacity on (F331). Requires the matched OTA product's tour plus the
 * event's tourDate; when several departures exist that day, tourTime
 * must disambiguate to exactly one — otherwise the link is left unset
 * rather than guessing a schedule.
 */
async function resolveOtaSchedule(
	ctx: MutationCtx,
	organizationId: string,
	tourId: Id<"tours">,
	tourDate: string | undefined,
	tourTime: string | undefined,
): Promise<Doc<"tourSchedules"> | null> {
	if (!tourDate) return null;
	const candidates = (
		await ctx.db
			.query("tourSchedules")
			.withIndex("by_tour_date", (q) => q.eq("tourId", tourId).eq("date", tourDate))
			.collect()
	).filter((s) => s.organizationId === organizationId && s.status !== "cancelled");
	if (candidates.length === 0) return null;
	if (candidates.length === 1) return candidates[0];
	if (tourTime) {
		const byTime = candidates.filter((s) => s.startTime === tourTime);
		if (byTime.length === 1) return byTime[0];
	}
	return null;
}

/**
 * Move an OTA reservation's guest count on/off a schedule's
 * capacityBooked (F331). Unlike incrementBooked/decrementBooked this
 * never throws on oversell: the OTA already sold the seat, so
 * capacityBooked past capacityTotal records the true oversell and the
 * "full" flip stops new direct bookings. Decrement floors at 0 with a
 * warn — a cancelled row must never strand the reservation's removal.
 */
async function applyOtaCapacity(
	ctx: MutationCtx,
	organizationId: string,
	scheduleId: Id<"tourSchedules">,
	guests: number,
): Promise<void> {
	const schedule = await ctx.db.get(scheduleId);
	if (!schedule || schedule.organizationId !== organizationId) return;
	if (guests > 0) {
		if (schedule.status === "cancelled") return;
		const newBooked = schedule.capacityBooked + guests;
		await ctx.db.patch(scheduleId, {
			capacityBooked: newBooked,
			status: newBooked >= schedule.capacityTotal ? "full" : schedule.status,
			updatedAt: Date.now(),
		});
	} else if (guests < 0) {
		const newBooked = schedule.capacityBooked + guests;
		if (newBooked < 0) {
			console.warn(
				`ota capacity: decrement of ${-guests} exceeds capacityBooked ${schedule.capacityBooked} on schedule ${scheduleId} — flooring at 0`,
			);
		}
		const clamped = Math.max(0, newBooked);
		await ctx.db.patch(scheduleId, {
			capacityBooked: clamped,
			status:
				schedule.status === "full" && clamped < schedule.capacityTotal
					? "available"
					: schedule.status,
			updatedAt: Date.now(),
		});
	}
}

/**
 * Current status of the OTA booking for (integrationId, reservationId)
 * — null when no row exists. Used by the webhook dedup path to tell a
 * true retry (booking still confirmed) from a re-confirmation after a
 * cancel (F89).
 */
export const getOtaBookingStatus = internalQuery({
	args: {
		integrationId: v.id("otaIntegrations"),
		reservationId: v.string(),
	},
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("otaBookings")
			.withIndex("by_integration_reservation", (q) =>
				q
					.eq("integrationId", args.integrationId)
					.eq("otaReservationId", args.reservationId),
			)
			.unique();
		return row?.status ?? null;
	},
});

export const cancelOtaBooking = internalMutation({
	args: {
		integrationId: v.id("otaIntegrations"),
		reservationId: v.string(),
		rawData: v.any(),
	},
	handler: async (ctx, args) => {
		// SECURITY: same cross-tenant guard as upsertOtaBooking — verify
		// the resolved row's organizationId matches the integration's
		// before patching, so a forged/mismatched pair can't cancel a
		// booking in another org (F312).
		const [existing, integration] = await Promise.all([
			ctx.db
				.query("otaBookings")
				.withIndex("by_integration_reservation", (q) =>
					q
						.eq("integrationId", args.integrationId)
						.eq("otaReservationId", args.reservationId),
				)
				.unique(),
			ctx.db.get(args.integrationId),
		]);
		if (!existing) return null;
		if (!integration || existing.organizationId !== integration.organizationId) {
			throw new ConvexError("organizationId does not match OTA integration");
		}
		const now = Date.now();
		// Release the seats this reservation held (F331) — only when the
		// row was actually holding them (confirmed + linked schedule).
		if (existing.status === "confirmed" && existing.scheduleId) {
			await applyOtaCapacity(
				ctx,
				existing.organizationId,
				existing.scheduleId,
				-existing.otaGuests,
			);
		}
		await ctx.db.patch(existing._id, {
			status: "cancelled",
			cancelledAt: now,
			lastSyncAt: now,
			rawOtaData: args.rawData,
		});
		await logAudit(ctx, {
			organizationId: existing.organizationId,
			userId: "system",
			action: "ota_booking.cancelled",
			resourceType: "otaBooking",
			resourceId: existing._id,
			oldValues: { status: existing.status },
			newValues: { status: "cancelled", reservationId: args.reservationId },
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
		const product = await ctx.db
			.query("otaProducts")
			.withIndex("by_integration_product", (q) =>
				q
					.eq("integrationId", args.integrationId)
					.eq("otaProductId", args.event.productId),
			)
			.first();
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
			await ctx.db.patch(existing._id, {
				...doc,
				timeSlots: existing.timeSlots ?? doc.timeSlots,
			});
			await logAudit(ctx, {
				organizationId: product.organizationId,
				userId: "system",
				action: "ota_availability.updated",
				resourceType: "otaAvailabilityCache",
				resourceId: existing._id,
				oldValues: {
					availableSpaces: existing.availableSpaces,
					totalSpaces: existing.totalSpaces,
				},
				newValues: {
					availableSpaces: args.event.availableSpaces,
					totalSpaces: args.event.totalSpaces,
					date: args.event.date,
				},
			});
			return existing._id;
		}
		const cacheId = await ctx.db.insert("otaAvailabilityCache", doc);
		await logAudit(ctx, {
			organizationId: product.organizationId,
			userId: "system",
			action: "ota_availability.created",
			resourceType: "otaAvailabilityCache",
			resourceId: cacheId,
			oldValues: {},
			newValues: {
				availableSpaces: args.event.availableSpaces,
				totalSpaces: args.event.totalSpaces,
				date: args.event.date,
			},
		});
		return cacheId;
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
