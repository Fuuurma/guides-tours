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
// Phase 6.4+: import + register the remaining 6.
// import { getYourGuideWebhook } from "./getYourGuide_webhook";
// import { airbnbWebhook } from "./airbnb_webhook";
// import { tripAdvisorWebhook } from "./tripAdvisor_webhook";
// import { klookWebhook } from "./klook_webhook";
// import { bookingWebhook } from "./booking_webhook";
// import { expediaWebhook } from "./expedia_webhook";

export function registerOtaRoutes(http: HttpRouter): void {
	http.route({
		path: "/api/ota/webhooks/viator",
		method: "POST",
		handler: viatorWebhook,
	});

	// http.route({
	//   path: "/api/ota/webhooks/getYourGuide",
	//   method: "POST",
	//   handler: getYourGuideWebhook,
	// });
	// ... etc for the remaining 6 providers in Phase 6.4+
}
