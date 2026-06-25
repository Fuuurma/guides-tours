/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authz from "../authz.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as notification_dispatch from "../notification_dispatch.js";
import type * as notifications from "../notifications.js";
import type * as organizations from "../organizations.js";
import type * as ota_http_client from "../ota/http_client.js";
import type * as ota_integrations from "../ota/integrations.js";
import type * as ota_router from "../ota/router.js";
import type * as ota_types from "../ota/types.js";
import type * as ota_upsert from "../ota/upsert.js";
import type * as ota_viator from "../ota/viator.js";
import type * as ota_viator_webhook from "../ota/viator_webhook.js";
import type * as ota_webhook_verify from "../ota/webhook_verify.js";
import type * as tours from "../tours.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authz: typeof authz;
  crons: typeof crons;
  http: typeof http;
  "lib/authz": typeof lib_authz;
  "lib/crypto": typeof lib_crypto;
  notification_dispatch: typeof notification_dispatch;
  notifications: typeof notifications;
  organizations: typeof organizations;
  "ota/http_client": typeof ota_http_client;
  "ota/integrations": typeof ota_integrations;
  "ota/router": typeof ota_router;
  "ota/types": typeof ota_types;
  "ota/upsert": typeof ota_upsert;
  "ota/viator": typeof ota_viator;
  "ota/viator_webhook": typeof ota_viator_webhook;
  "ota/webhook_verify": typeof ota_webhook_verify;
  tours: typeof tours;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
