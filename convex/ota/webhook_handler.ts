// Shared OTA webhook handler factory.
//
// All 7 OTA providers (airbnb, booking, expedia, getyourguide, klook,
// tripadvisor, viator) have nearly-identical webhook handler structure:
//   1. Method check (POST only)
//   2. Read signature + timestamp headers
//   3. Look up the integration by ID from query params
//   4. Verify HMAC signature (with timestamp replay protection)
//   5. Parse JSON body
//   6. Normalize to our internal event shape
//   7. Dispatch to shared upsert/cancel mutations
//
// The only per-provider differences are:
//   - signature header name (e.g. x-airbnb-signature)
//   - timestamp header name (e.g. x-airbnb-timestamp)
//   - log prefix (e.g. "[airbnb-webhook]")
//   - provider identifier (e.g. "airbnb")
//   - Client class with static verifyWebhookWithTimestamp + normalize methods
//
// createWebhookHandler() wires all of these into a single httpAction
// so each provider's webhook file is now a 5-line factory call.

import type { ActionCtx } from "../_generated/server";
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { decrypt } from "../lib/crypto";
import { logger } from "../lib/logger";
import type { Id } from "../_generated/dataModel";
import { verifyWebhookSignatureWithTimestamp } from "./webhook_verify";
import type { NormalizedProviderEvent } from "./types";

export interface WebhookConfig {
	/** Provider identifier — matches `otaIntegrations.provider`. */
	provider: string;
	/** HTTP header carrying the HMAC signature. */
	signatureHeader: string;
	/** HTTP header carrying the timestamp (optional for some providers). */
	timestampHeader: string;
	/** Reject deliveries whose timestamp header is absent instead of
	 * skipping the replay check. Opt-in per provider: real OTAs often
	 * send no timestamp header, so the default (false) stays
	 * compatible. Only enable for providers known to always send one
	 * (F83). */
	requireTimestamp?: boolean;
	/** Log prefix for this provider, e.g. "[airbnb-webhook]". */
	logPrefix: string;
	/** Normalize a parsed payload into our internal event shape. */
	normalize: (parsed: unknown) => NormalizedProviderEvent | null;
}

/**
 * Create an httpAction that handles a provider's webhook delivery.
 *
 * The returned handler:
 *   - Rejects non-POST with 405
 *   - Reads signature + timestamp from configured headers
 *   - Looks up the integration by `integrationId` query param
 *   - Verifies HMAC + timestamp (via the shared helper); 401 on failure
 *   - Parses JSON; returns 400 on parse error
 *   - Normalizes the event; returns 200 + "ignored" for unknown kinds
 *   - Dispatches upsert/cancel via shared mutations
 */
/** Deterministic short hash (djb2) — dedup key for malformed payloads
 * so identical retry attempts collapse to one audit row. */
function djb2Hash(input: string): string {
	let h = 5381;
	for (let i = 0; i < input.length; i++) {
		h = ((h << 5) + h + input.charCodeAt(i)) | 0;
	}
	return (h >>> 0).toString(36);
}

export function createWebhookHandler(config: WebhookConfig) {
	return httpAction(async (ctx, request) => {
		if (request.method !== "POST") {
			return new Response("method not allowed", { status: 405 });
		}

		const signature = request.headers.get(config.signatureHeader);
		if (!signature) {
			return new Response("missing signature", { status: 400 });
		}

		const timestampHeader = request.headers.get(config.timestampHeader);
		const rawBody = await request.text();
		// F341: unauthenticated route — cap the body before JSON.parse,
		// HMAC, and recordDelivery's rawPayload storage. Measure real
		// bytes (UTF-16 length lies for multibyte payloads — same F51
		// contract as the public booking path). 64 KB is generous for a
		// provider event while still bounding memory per request.
		const MAX_BODY_BYTES = 64 * 1024;
		if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
			return new Response("payload too large", { status: 413 });
		}

		const url = new URL(request.url);
		const integrationId = url.searchParams.get("integrationId");
		if (!integrationId) {
			return new Response("missing integrationId", { status: 400 });
		}

		let integration: {
			organizationId: string;
			provider: string;
			isActive: boolean;
			webhookSecret?: string;
		} | null;
		try {
			integration = await ctx.runQuery(
				internal.ota.integrations.getForWebhook,
				{ integrationId: integrationId as Id<"otaIntegrations"> },
			);
		} catch (err) {
			// A malformed integrationId fails the v.id arg validator
			// inside the query — map it to 400 so the provider isn't
			// told to retry a request that can never succeed (F123).
			// Any other failure is a real internal error and keeps
			// propagating as a 500.
			if (
				err instanceof Error &&
				err.message.includes("Expected ID for table")
			) {
				return new Response("invalid integrationId", { status: 400 });
			}
			throw err;
		}
		if (!integration) {
			return new Response("unknown integration", { status: 404 });
		}
		if (integration.provider !== config.provider) {
			return new Response("wrong provider for this route", { status: 400 });
		}
		if (!integration.isActive) {
			return new Response("integration is not active", { status: 410 });
		}
		if (!integration.webhookSecret) {
			return new Response("integration missing webhook secret", {
				status: 500,
			});
		}

		let secret: string;
		try {
			secret = await decrypt(integration.webhookSecret);
		} catch {
			// Corrupt/rotated secret in storage: fail closed with a 500
			// instead of an unhandled throw (fleet devin 2026-09-06).
			return new Response("integration secret undecryptable", {
				status: 500,
			});
		}
		const verifyResult = await verifyWebhookSignatureWithTimestamp(
			rawBody,
			signature,
			timestampHeader,
			secret,
			undefined,
			{ requireTimestamp: config.requireTimestamp },
		);
		if (verifyResult.reason === "skipped") {
			// Observability: surface providers that don't send a
			// timestamp header so operators can decide to flip
			// requireTimestamp on for them.
			logger.info(
				`${config.logPrefix} timestamp header absent — replay check skipped (provider compat)`,
			);
		}
		if (!verifyResult.valid) {
			// Don't echo the failure reason — it tells a caller which
			// check (signature vs timestamp) failed and aids probing.
			// The reason stays in the server log (needs-work 2026-09-10).
			logger.warn(
				`${config.logPrefix} webhook rejected on integration ${integrationId}: ${verifyResult.reason ?? "invalid signature"}`,
			);
			return new Response("invalid signature", { status: 401 });
		}
		// Surface a skipped replay check — the request verified, but
		// an operator auditing replay protection needs to see which
		// providers never send a timestamp (F83).
		if (verifyResult.reason === "skipped") {
			logger.info(
				`${config.logPrefix} replay check skipped (no timestamp header) on integration ${integrationId}`,
			);
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(rawBody);
		} catch {
			return new Response("invalid JSON", { status: 400 });
		}
		// A signed-but-malformed payload escaping normalize() would
		// otherwise 5xx BEFORE recordDelivery — zero audit trail and
		// infinite poison retries. Controlled 400 + a failed-delivery
		// audit row; identical retries dedup via a body hash (F86/F130).
		let event: NormalizedProviderEvent | null;
		try {
			event = config.normalize(parsed);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const malformedId = `malformed:${integrationId}:${djb2Hash(rawBody)}`;
			await ctx.runMutation(internal.webhookDeliveries.recordDelivery, {
				organizationId: integration.organizationId,
				source: config.provider,
				eventId: malformedId,
				eventType: "malformed",
				integrationId: integrationId as Id<"otaIntegrations">,
				ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
				userAgent: request.headers.get("user-agent") ?? undefined,
				payload: parsed,
			});
			await ctx.runMutation(
				internal.webhookDeliveries.updateDeliveryStatus,
				{
					organizationId: integration.organizationId,
					source: config.provider,
					eventId: malformedId,
					status: "failed",
					errorMessage: message,
				},
			);
			logger.error(
				`${config.logPrefix} malformed payload on integration ${integrationId}: ${message}`,
			);
			return new Response("malformed payload", { status: 400 });
		}
		if (!event) {
			logger.info(
				`${config.logPrefix} ignored event type on integration ${integrationId}`,
			);
			return new Response("ignored", { status: 200 });
		}

		// Record the delivery (idempotent on source+eventId). We use
		// the OTA's reservationId as the unique eventId — each
		// provider guarantees uniqueness within their namespace.
		const eventId = extractEventId(event);
		if (eventId) {
			const recorded = await ctx.runMutation(
				internal.webhookDeliveries.recordDelivery,
				{
					organizationId: integration.organizationId,
					source: config.provider,
					eventId,
					eventType: event.kind,
					integrationId: integrationId as Id<"otaIntegrations">,
					ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
					userAgent: request.headers.get("user-agent") ?? undefined,
					payload: parsed,
				},
			);
			if (recorded.isDuplicate) {
				// Only a completed delivery is a true duplicate. A prior
				// attempt that never finished — 'failed' dispatch, or
				// stuck 'received'/'processing' after a crash — must be
				// re-dispatched on the provider's retry, not acked as a
				// duplicate (needs-work 2026-09-11: failed dispatches
				// were unrecoverable because retries were swallowed).
				const s = recorded.existingStatus;
				let dropAsDuplicate = s === "processed" || s === "skipped";
				if (dropAsDuplicate && event.kind === "booking.created") {
					// F89: eventId is `booking.created:<reservationId>` — a
					// re-emitted BOOKING_CREATED after a cancel is a
					// re-confirmation, not a retry. It must reach
					// upsertOtaBooking to clear cancelledAt; only drop when
					// the booking is still confirmed (a real duplicate).
					const bookingStatus = await ctx.runQuery(
						internal.ota.upsert.getOtaBookingStatus,
						{
							integrationId: integrationId as Id<"otaIntegrations">,
							reservationId: event.reservationId,
						},
					);
					if (bookingStatus !== "confirmed") {
						dropAsDuplicate = false;
						logger.info(
							`${config.logPrefix} re-confirmation ${eventId} on integration ${integrationId} (booking is ${bookingStatus ?? "missing"})`,
						);
					}
				}
				if (dropAsDuplicate) {
					logger.info(
						`${config.logPrefix} duplicate event ${eventId} on integration ${integrationId}`,
					);
					return new Response("ok (duplicate)", { status: 200 });
				}
				if (s !== "processed" && s !== "skipped") {
					logger.warn(
						`${config.logPrefix} re-dispatching event ${eventId} on integration ${integrationId} (prior status: ${s ?? "unknown"})`,
					);
				}
			}
		}

		try {
			const outcome = await dispatchEvent(
				ctx,
				integrationId,
				integration.organizationId,
				event,
				config.provider,
			);
			if (eventId) {
				if (outcome === "unmatched_product") {
					// F340: availability.update for an otaProductId we have no
					// mapping for — nothing was cached. Mark skipped (not
					// processed) with a reason so ops can see and fix the
					// mapping; a later provider retry after the product is
					// mapped re-dispatches through the non-processed path.
					logger.warn(
						`${config.logPrefix} ${eventId} dropped: no product mapping for this otaProductId`,
					);
					await ctx.runMutation(
						internal.webhookDeliveries.updateDeliveryStatus,
						{
							organizationId: integration.organizationId,
							source: config.provider,
							eventId,
							status: "skipped",
							skipReason: "unknown otaProductId — no product mapping",
						},
					);
				} else {
					await ctx.runMutation(
						internal.webhookDeliveries.updateDeliveryStatus,
						{
							organizationId: integration.organizationId,
							source: config.provider,
							eventId,
							status: "processed",
						},
					);
				}
			}
		} catch (err) {
			if (eventId) {
				await ctx.runMutation(
					internal.webhookDeliveries.updateDeliveryStatus,
					{
						organizationId: integration.organizationId,
						source: config.provider,
						eventId,
						status: "failed",
						errorMessage:
							err instanceof Error ? err.message : String(err),
					},
				);
			}
			throw err;
		}

		return new Response("ok", { status: 200 });
	});
}

/**
 * Extract a stable eventId from a normalized event. The OTA's
 * reservationId is the natural key — each provider guarantees
 * uniqueness for the lifetime of a booking.
 */
export function extractEventId(event: NormalizedProviderEvent): string | null {
	if (event.kind === "booking.created" || event.kind === "booking.cancelled") {
		// Prefix with the kind — create and cancel share the same
		// reservationId, so a bare reservationId made the cancel dedup
		// against the create and get swallowed (needs-work 2026-09-11).
		return `${event.kind}:${event.reservationId}`;
	}
	if (event.kind === "availability.update") {
		// availability.update has no reservationId — and productId+date
		// alone would dedup every later update for that slot against the
		// first (F55). Hash the payload so identical retries collapse
		// while a changed availability payload dispatches.
		return `availability:${event.productId}:${event.date}:${djb2Hash(JSON.stringify(event.rawPayload))}`;
	}
	return null;
}

/** F340: outcome the caller needs for honest audit — "unmatched_product"
 * means the event referenced an otaProductId we have no mapping for, so
 * nothing was cached. The delivery must not be marked "processed". */
type DispatchOutcome = "processed" | "unmatched_product";

async function dispatchEvent(
	ctx: ActionCtx,
	integrationId: string,
	organizationId: string,
	event: NormalizedProviderEvent,
	provider: string,
): Promise<DispatchOutcome> {
	if (event.kind === "booking.created") {
		await ctx.runMutation(internal.ota.upsert.upsertOtaBooking, {
			integrationId: integrationId as Id<"otaIntegrations">,
			organizationId,
			provider,
			event,
			rawData: event.rawPayload,
		});
		return "processed";
	}
	if (event.kind === "booking.cancelled") {
		await ctx.runMutation(internal.ota.upsert.cancelOtaBooking, {
			integrationId: integrationId as Id<"otaIntegrations">,
			reservationId: event.reservationId,
			rawData: event.rawPayload,
		});
		return "processed";
	}
	if (event.kind === "availability.update") {
		const result = await ctx.runMutation(
			internal.ota.upsert.upsertAvailabilityCache,
			{
				integrationId: integrationId as Id<"otaIntegrations">,
				event,
			},
		);
		return result === null ? "unmatched_product" : "processed";
	}
	return "processed";
}
