// TripAdvisor webhook handler.

import { TripAdvisorClient } from "./tripadvisor";
import { createWebhookHandler } from "./webhook_handler";

export const tripAdvisorWebhook = createWebhookHandler({
	provider: "tripadvisor",
	signatureHeader: "x-tripadvisor-signature",
	timestampHeader: "x-tripadvisor-timestamp",
	logPrefix: "[tripadvisor-webhook]",
	client: TripAdvisorClient,
});
