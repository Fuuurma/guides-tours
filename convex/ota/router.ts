// HTTP route registration for OTA webhooks.
//
// Pattern: one httpAction per provider, registered at the exact
// path /api/ota/webhooks/{provider}. Each handler is in its own
// file (convex/ota/{provider}_webhook.ts) and does:
//   1. HMAC signature verification
//   2. Payload normalization
//   3. Dispatch to shared upsert mutations
//
// We export `registerOtaRoutes(http)` so convex/http.ts can call us
// with the live router. Keeps the wiring in one place as providers
// are added.

import type { HttpRouter } from "convex/server";
import { viatorWebhook } from "./viator_webhook";
import { getYourGuideWebhook } from "./getyourguide_webhook";
import { airbnbWebhook } from "./airbnb_webhook";
import { tripAdvisorWebhook } from "./tripadvisor_webhook";
import { klookWebhook } from "./klook_webhook";
import { bookingWebhook } from "./booking_webhook";
import { expediaWebhook } from "./expedia_webhook";

export function registerOtaRoutes(http: HttpRouter): void {
	http.route({
		path: "/api/ota/webhooks/viator",
		method: "POST",
		handler: viatorWebhook,
	});
	http.route({
		path: "/api/ota/webhooks/getYourGuide",
		method: "POST",
		handler: getYourGuideWebhook,
	});
	http.route({
		path: "/api/ota/webhooks/airbnb",
		method: "POST",
		handler: airbnbWebhook,
	});
	http.route({
		path: "/api/ota/webhooks/tripAdvisor",
		method: "POST",
		handler: tripAdvisorWebhook,
	});
	http.route({
		path: "/api/ota/webhooks/klook",
		method: "POST",
		handler: klookWebhook,
	});
	http.route({
		path: "/api/ota/webhooks/booking",
		method: "POST",
		handler: bookingWebhook,
	});
	http.route({
		path: "/api/ota/webhooks/expedia",
		method: "POST",
		handler: expediaWebhook,
	});
}