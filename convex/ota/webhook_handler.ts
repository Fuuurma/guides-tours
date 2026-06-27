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
import type { Id } from "../_generated/dataModel";
import type { NormalizedProviderEvent } from "./types";

export interface WebhookConfig {
	/** Provider identifier — matches `otaIntegrations.provider`. */
	provider: string;
	/** HTTP header carrying the HMAC signature. */
	signatureHeader: string;
	/** HTTP header carrying the timestamp (optional for some providers). */
	timestampHeader: string;
	/** Log prefix for this provider, e.g. "[airbnb-webhook]". */
	logPrefix: string;
	/** Client class with verifyWebhookWithTimestamp + normalize statics. */
	client: {
		verifyWebhookWithTimestamp(
			rawBody: string,
			signature: string,
			timestampHeader: string | null,
			secret: string,
		): Promise<{ valid: boolean; reason?: string }>;
		normalize(parsed: unknown): NormalizedProviderEvent | null;
	};
}

/**
 * Create an httpAction that handles a provider's webhook delivery.
 *
 * The returned handler:
 *   - Rejects non-POST with 405
 *   - Reads signature + timestamp from configured headers
 *   - Looks up the integration by `integrationId` query param
 *   - Verifies HMAC + timestamp; returns 401 on failure
 *   - Parses JSON; returns 400 on parse error
 *   - Normalizes the event; returns 200 + "ignored" for unknown kinds
 *   - Dispatches upsert/cancel via shared mutations
 */
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

		const url = new URL(request.url);
		const integrationId = url.searchParams.get("integrationId");
		if (!integrationId) {
			return new Response("missing integrationId", { status: 400 });
		}

		const integration = await ctx.runQuery(
			internal.ota.integrations.getForWebhook,
			{ integrationId: integrationId as Id<"otaIntegrations"> },
		);
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

		const secret = await decrypt(integration.webhookSecret);
		const verifyResult = await config.client.verifyWebhookWithTimestamp(
			rawBody,
			signature,
			timestampHeader,
			secret,
		);
		if (!verifyResult.valid) {
			if (verifyResult.reason) {
				return new Response(`rejected: ${verifyResult.reason}`, {
					status: 401,
				});
			}
			return new Response("invalid signature", { status: 401 });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(rawBody);
		} catch {
			return new Response("invalid JSON", { status: 400 });
		}
		const event = config.client.normalize(parsed);
		if (!event) {
			console.log(
				`${config.logPrefix} ignored event type on integration ${integrationId}`,
			);
			return new Response("ignored", { status: 200 });
		}

		await dispatchEvent(
			ctx,
			integrationId,
			integration.organizationId,
			event,
			config.provider,
			config.logPrefix,
		);

		return new Response("ok", { status: 200 });
	});
}

async function dispatchEvent(
	ctx: ActionCtx,
	integrationId: string,
	organizationId: string,
	event: NormalizedProviderEvent,
	provider: string,
	logPrefix: string,
): Promise<void> {
	if (event.kind === "booking.created") {
		await ctx.runMutation(internal.ota.upsert.upsertOtaBooking, {
			integrationId: integrationId as Id<"otaIntegrations">,
			organizationId,
			provider,
			event,
			rawData: event.rawPayload,
		});
		return;
	}
	if (event.kind === "booking.cancelled") {
		await ctx.runMutation(internal.ota.upsert.cancelOtaBooking, {
			integrationId: integrationId as Id<"otaIntegrations">,
			reservationId: event.reservationId,
			rawData: event.rawPayload,
		});
		return;
	}
	console.log(
		`${logPrefix} availability.update on ${integrationId} — handled by scheduled sync`,
	);
}
