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

// Paths use the canonical lowercase provider ids from types.ts —
// the dashboard (ota.tsx) and DEPLOYMENT.md publish
// /api/ota/webhooks/{providerId}, and httpRouter matches paths
// case-sensitively, so camelCase mounts would 404 the registered URL
// before signature verification (F91).
const ROUTES = [
	{ path: "/api/ota/webhooks/viator", handler: viatorWebhook },
	{ path: "/api/ota/webhooks/getyourguide", handler: getYourGuideWebhook },
	{ path: "/api/ota/webhooks/airbnb", handler: airbnbWebhook },
	{ path: "/api/ota/webhooks/tripadvisor", handler: tripAdvisorWebhook },
	{ path: "/api/ota/webhooks/klook", handler: klookWebhook },
	{ path: "/api/ota/webhooks/booking", handler: bookingWebhook },
	{ path: "/api/ota/webhooks/expedia", handler: expediaWebhook },
] as const;

export function registerOtaRoutes(http: HttpRouter): void {
	for (const { path, handler } of ROUTES) {
		http.route({ path, method: "POST", handler });
	}
}
