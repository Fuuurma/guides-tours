import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { registerOtaRoutes } from "./ota/router";

const http = httpRouter();

// Better Auth's catch-all handler for /api/auth/* (sign-up, sign-in,
// get-session, OAuth callbacks, etc).
authComponent.registerRoutes(http, createAuth);

// Mount OTA webhook routes. Each provider's handler is registered
// at /api/ota/webhooks/{provider}. Add new providers in
// convex/ota/router.ts.
registerOtaRoutes(http);

export default http;
