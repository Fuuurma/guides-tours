// Expedia webhook handler.

import { httpAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { ExpediaClient } from "./expedia";
import { decrypt } from "../lib/crypto";
import type { Id } from "../_generated/dataModel";
import type { NormalizedProviderEvent } from "./types";

export const expediaWebhook = httpAction(async (ctx, request) => {
	if (request.method !== "POST") {
		return new Response("method not allowed", { status: 405 });
	}

	const signature = request.headers.get("x-expedia-signature");
	if (!signature) {
		return new Response("missing signature", { status: 400 });
	}

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
	if (integration.provider !== "expedia") {
		return new Response("wrong provider for this route", { status: 400 });
	}
	if (!integration.isActive) {
		return new Response("integration is not active", { status: 410 });
	}
	if (!integration.webhookSecret) {
		return new Response("integration missing webhook secret", { status: 500 });
	}

	const secret = await decrypt(integration.webhookSecret);
	const valid = await ExpediaClient.verifyWebhook(rawBody, signature, secret);
	if (!valid) {
		return new Response("invalid signature", { status: 401 });
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		return new Response("invalid JSON", { status: 400 });
	}
	const event = ExpediaClient.normalize(parsed);
	if (!event) {
		console.log(
			`[expedia-webhook] ignored event type on integration ${integrationId}`,
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
			provider: "expedia",
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
		`[expedia-webhook] availability.update on ${integrationId} — handled by scheduled sync`,
	);
}