// Viator webhook handler.
//
// signature, normalizes the payload, and calls the shared upsert
// mutations. On any failure, returns a 4xx so Viator retries.

import { ViatorClient } from "./viator";
import { createWebhookHandler } from "./webhook_handler";

export const viatorWebhook = createWebhookHandler({
	provider: "viator",
	signatureHeader: "x-viator-signature",
	timestampHeader: "x-viator-timestamp",
	logPrefix: "[viator-webhook]",
	normalize: ViatorClient.normalize,
});
