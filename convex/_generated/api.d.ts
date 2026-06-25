/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as assignments from "../assignments.js";
import type * as auth from "../auth.js";
import type * as authz from "../authz.js";
import type * as availabilities from "../availabilities.js";
import type * as bookings from "../bookings.js";
import type * as crons from "../crons.js";
import type * as customers from "../customers.js";
import type * as drivers from "../drivers.js";
import type * as http from "../http.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_awsSigV4 from "../lib/awsSigV4.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as notificationTemplates from "../notificationTemplates.js";
import type * as notification_dispatch from "../notification_dispatch.js";
import type * as notifications from "../notifications.js";
import type * as organizations from "../organizations.js";
import type * as ota_airbnb from "../ota/airbnb.js";
import type * as ota_airbnb_webhook from "../ota/airbnb_webhook.js";
import type * as ota_booking from "../ota/booking.js";
import type * as ota_booking_webhook from "../ota/booking_webhook.js";
import type * as ota_expedia from "../ota/expedia.js";
import type * as ota_expedia_webhook from "../ota/expedia_webhook.js";
import type * as ota_getyourguide from "../ota/getyourguide.js";
import type * as ota_getyourguide_webhook from "../ota/getyourguide_webhook.js";
import type * as ota_http_client from "../ota/http_client.js";
import type * as ota_integrations from "../ota/integrations.js";
import type * as ota_klook from "../ota/klook.js";
import type * as ota_klook_webhook from "../ota/klook_webhook.js";
import type * as ota_router from "../ota/router.js";
import type * as ota_tripadvisor from "../ota/tripadvisor.js";
import type * as ota_tripadvisor_webhook from "../ota/tripadvisor_webhook.js";
import type * as ota_types from "../ota/types.js";
import type * as ota_upsert from "../ota/upsert.js";
import type * as ota_viator from "../ota/viator.js";
import type * as ota_viator_webhook from "../ota/viator_webhook.js";
import type * as ota_webhook_verify from "../ota/webhook_verify.js";
import type * as payments from "../payments.js";
import type * as payments_stripe from "../payments_stripe.js";
import type * as payments_stripe_actions from "../payments_stripe_actions.js";
import type * as public_booking from "../public_booking.js";
import type * as scheduledNotifications from "../scheduledNotifications.js";
import type * as tourBlackoutDates from "../tourBlackoutDates.js";
import type * as tourCategories from "../tourCategories.js";
import type * as tourSchedules from "../tourSchedules.js";
import type * as tourTemplates from "../tourTemplates.js";
import type * as tours from "../tours.js";
import type * as vacationRequests from "../vacationRequests.js";
import type * as vehicles from "../vehicles.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  assignments: typeof assignments;
  auth: typeof auth;
  authz: typeof authz;
  availabilities: typeof availabilities;
  bookings: typeof bookings;
  crons: typeof crons;
  customers: typeof customers;
  drivers: typeof drivers;
  http: typeof http;
  "lib/authz": typeof lib_authz;
  "lib/awsSigV4": typeof lib_awsSigV4;
  "lib/crypto": typeof lib_crypto;
  notificationTemplates: typeof notificationTemplates;
  notification_dispatch: typeof notification_dispatch;
  notifications: typeof notifications;
  organizations: typeof organizations;
  "ota/airbnb": typeof ota_airbnb;
  "ota/airbnb_webhook": typeof ota_airbnb_webhook;
  "ota/booking": typeof ota_booking;
  "ota/booking_webhook": typeof ota_booking_webhook;
  "ota/expedia": typeof ota_expedia;
  "ota/expedia_webhook": typeof ota_expedia_webhook;
  "ota/getyourguide": typeof ota_getyourguide;
  "ota/getyourguide_webhook": typeof ota_getyourguide_webhook;
  "ota/http_client": typeof ota_http_client;
  "ota/integrations": typeof ota_integrations;
  "ota/klook": typeof ota_klook;
  "ota/klook_webhook": typeof ota_klook_webhook;
  "ota/router": typeof ota_router;
  "ota/tripadvisor": typeof ota_tripadvisor;
  "ota/tripadvisor_webhook": typeof ota_tripadvisor_webhook;
  "ota/types": typeof ota_types;
  "ota/upsert": typeof ota_upsert;
  "ota/viator": typeof ota_viator;
  "ota/viator_webhook": typeof ota_viator_webhook;
  "ota/webhook_verify": typeof ota_webhook_verify;
  payments: typeof payments;
  payments_stripe: typeof payments_stripe;
  payments_stripe_actions: typeof payments_stripe_actions;
  public_booking: typeof public_booking;
  scheduledNotifications: typeof scheduledNotifications;
  tourBlackoutDates: typeof tourBlackoutDates;
  tourCategories: typeof tourCategories;
  tourSchedules: typeof tourSchedules;
  tourTemplates: typeof tourTemplates;
  tours: typeof tours;
  vacationRequests: typeof vacationRequests;
  vehicles: typeof vehicles;
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
