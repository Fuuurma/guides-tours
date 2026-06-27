// Expedia webhook handler.

import { ExpediaClient } from "./expedia";
import { createWebhookHandler } from "./webhook_handler";

export const expediaWebhook = createWebhookHandler({
	provider: "expedia",
	signatureHeader: "x-expedia-signature",
	timestampHeader: "x-expedia-timestamp",
	logPrefix: "[expedia-webhook]",
	normalize: ExpediaClient.normalize,
});
