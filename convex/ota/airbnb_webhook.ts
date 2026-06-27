// Airbnb webhook handler.

import { AirbnbClient } from "./airbnb";
import { createWebhookHandler } from "./webhook_handler";

export const airbnbWebhook = createWebhookHandler({
	provider: "airbnb",
	signatureHeader: "x-airbnb-signature",
	timestampHeader: "x-airbnb-timestamp",
	logPrefix: "[airbnb-webhook]",
	normalize: AirbnbClient.normalize,
});
