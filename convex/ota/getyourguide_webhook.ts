// GetYourGuide webhook handler.
//
// Receives POST /api/ota/webhooks/getYourGuide, verifies the HMAC-SHA256
// signature, normalizes the payload, and calls the shared upsert
// mutations. On any failure, returns a 4xx so GetYourGuide retries.

import { GetYourGuideClient } from "./getyourguide";
import { createWebhookHandler } from "./webhook_handler";

export const getYourGuideWebhook = createWebhookHandler({
	provider: "getyourguide",
	signatureHeader: "x-getyourguide-signature",
	timestampHeader: "x-getyourguide-timestamp",
	logPrefix: "[getyourguide-webhook]",
	client: GetYourGuideClient,
});
