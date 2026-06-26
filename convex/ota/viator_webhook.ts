// Viator webhook handler.
//
// Receives POST /api/ota/webhooks/viator, verifies the HMAC-SHA256
// signature, normalizes the payload, and calls the shared upsert
// mutations. On any failure, returns a 4xx so Viator retries
// (matching source's retry semantics — they don't auto-retry on 2xx).
//
// Called from the central OTA router at convex/ota/router.ts.

import { httpAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { ViatorClient } from "./viator";
import { decrypt } from "../lib/crypto";
import { verifyWebhookSignatureWithTimestamp } from "./webhook_verify";
import type { Id } from "../_generated/dataModel";
import type { NormalizedProviderEvent } from "./types";

export const viatorWebhook = httpAction(async (ctx, request) => {
	if (request.method !== "POST") {
		return new Response("method not allowed", { status: 405 });
	}

	const signature = request.headers.get("x-viator-signature");
	if (!signature) {
		return new Response("missing signature", { status: 400 });
	}

	const timestampHeader = request.headers.get("x-viator-timestamp");

	// Read raw body for HMAC verification. We must verify before
	// parsing — otherwise a malformed payload could slip through.
	const rawBody = await request.text();

	// Resolve the integration from the URL path. The router passes
	// `integrationId` as a query param.
	const url = new URL(request.url);
	const integrationId = url.searchParams.get("integrationId");
	if (!integrationId) {
		return new Response("missing integrationId", { status: 400 });
	}

	// Look up the integration to get the webhook secret (still encrypted).
	const integration = await ctx.runQuery(
		internal.ota.integrations.getForWebhook,
		{ integrationId: integrationId as Id<"otaIntegrations"> },
	);
	if (!integration) {
		return new Response("unknown integration", { status: 404 });
	}
	if (integration.provider !== "viator") {
		return new Response("wrong provider for this route", { status: 400 });
	}
	if (!integration.isActive) {
		return new Response("integration is not active", { status: 410 });
	}
	if (!integration.webhookSecret) {
		return new Response("integration missing webhook secret", { status: 500 });
	}

	const secret = await decrypt(integration.webhookSecret);
	const verifyResult = await verifyWebhookSignatureWithTimestamp(
		rawBody,
		signature,
		timestampHeader,
		secret,
	);
	if (!verifyResult.valid) {
		if (verifyResult.reason && verifyResult.reason !== undefined) {
			return new Response(`rejected: ${verifyResult.reason}`, { status: 401 });
		}
		return new Response("invalid signature", { status: 401 });
	}

	// Parse + normalize. Reject payloads we can't normalize (Viator
	// will retry — better to be loud than to lose data).
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		return new Response("invalid JSON", { status: 400 });
	}
	const event = ViatorClient.normalize(parsed);
	if (!event) {
		// Unknown event type — accept (2xx) so Viator stops retrying,
		// but log so we can extend the normalizer if needed.
		console.log(
			`[viator-webhook] ignored event type on integration ${integrationId}`,
		);
		return new Response("ignored", { status: 200 });
	}

	await dispatchEvent(ctx, integrationId, integration.organizationId, event);

	return new Response("ok", { status: 200 });
});

async function dispatchEvent(
	ctx: ActionCtx,
	integrationId: string,
	organizationId: string,
	event: NormalizedProviderEvent,
): Promise<void> {
	if (event.kind === "booking.created") {
		await ctx.runMutation(internal.ota.upsert.upsertOtaBooking, {
			integrationId: integrationId as Id<"otaIntegrations">,
			organizationId,
			provider: "viator",
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
	// availability.update — we don't auto-process this on webhook;
	// it goes through the scheduled sync. Log + ack.
	console.log(
		`[viator-webhook] availability.update on ${integrationId} — handled by scheduled sync`,
	);
}
