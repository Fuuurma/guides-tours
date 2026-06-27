// Klook webhook handler.

import { KlookClient } from "./klook";
import { createWebhookHandler } from "./webhook_handler";

export const klookWebhook = createWebhookHandler({
	provider: "klook",
	signatureHeader: "x-klook-signature",
	timestampHeader: "x-klook-timestamp",
	logPrefix: "[klook-webhook]",
	client: KlookClient,
});
