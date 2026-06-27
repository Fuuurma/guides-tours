// Booking.com webhook handler.

import { BookingClient } from "./booking";
import { createWebhookHandler } from "./webhook_handler";

export const bookingWebhook = createWebhookHandler({
	provider: "booking",
	signatureHeader: "x-booking-signature",
	timestampHeader: "x-booking-timestamp",
	logPrefix: "[booking-webhook]",
	normalize: BookingClient.normalize,
});
