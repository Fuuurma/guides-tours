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
import type * as authClient from "../authClient.js";
import type * as billing from "../billing/index.js";
import type * as billingConstants from "../billing/constants.js";
import type * as billingMutations from "../billing/mutations.js";
import type * as billingQueries from "../billing/queries.js";
import type * as customers from "../customers.js";
import type * as http from "../http.js";
import type * as inventory from "../inventory/index.js";
import type * as inventoryDecrement from "../inventory/decrement.js";
import type * as inventoryItems from "../inventory/items.js";
import type * as inventorySuppliers from "../inventory/suppliers.js";
import type * as lib from "../lib/index.js";
import type * as menu from "../menu/index.js";
import type * as menuCategories from "../menu/categories.js";
import type * as menuMenuItems from "../menu/menuItems.js";
import type * as notifications from "../notifications/index.js";
import type * as notificationsEmail from "../notifications/email.js";
import type * as notificationsSend from "../notifications/send.js";
import type * as orders from "../orders/index.js";
import type * as ordersConstants from "../orders/constants.js";
import type * as ordersMutations from "../orders/mutations.js";
import type * as ordersQueries from "../orders/queries.js";
import type * as reports from "../reports/index.js";
import type * as reportsConstants from "../reports/constants.js";
import type * as reportsQueries from "../reports/queries.js";
import type * as reservations from "../reservations/index.js";
import type * as reservationsConstants from "../reservations/constants.js";
import type * as reservationsHelpers from "../reservations/helpers.js";
import type * as reservationsMutations from "../reservations/mutations.js";
import type * as reservationsQueries from "../reservations/queries.js";
import type * as restaurants from "../restaurants.js";
import type * as session from "../session.js";
import type * as staff from "../staff/index.js";
import type * as staffAuditLogs from "../staff/auditLogs.js";
import type * as staffMembers from "../staff/members.js";
import type * as stripe from "../stripe.js";
import type * as tables from "../tables.js";
import type * as waitlist from "../waitlist/index.js";
import type * as waitlistConstants from "../waitlist/constants.js";
import type * as waitlistEngine from "../waitlist/engine.js";
import type * as waitlistQueries from "../waitlist/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authClient: typeof authClient;
  billing: typeof billing;
  billingConstants: typeof billingConstants;
  billingMutations: typeof billingMutations;
  billingQueries: typeof billingQueries;
  customers: typeof customers;
  http: typeof http;
  inventory: typeof inventory;
  inventoryDecrement: typeof inventoryDecrement;
  inventoryItems: typeof inventoryItems;
  inventorySuppliers: typeof inventorySuppliers;
  lib: typeof lib;
  menu: typeof menu;
  menuCategories: typeof menuCategories;
  menuMenuItems: typeof menuMenuItems;
  notifications: typeof notifications;
  notificationsEmail: typeof notificationsEmail;
  notificationsSend: typeof notificationsSend;
  orders: typeof orders;
  ordersConstants: typeof ordersConstants;
  ordersMutations: typeof ordersMutations;
  ordersQueries: typeof ordersQueries;
  reports: typeof reports;
  reportsConstants: typeof reportsConstants;
  reportsQueries: typeof reportsQueries;
  reservations: typeof reservations;
  reservationsConstants: typeof reservationsConstants;
  reservationsHelpers: typeof reservationsHelpers;
  reservationsMutations: typeof reservationsMutations;
  reservationsQueries: typeof reservationsQueries;
  restaurants: typeof restaurants;
  session: typeof session;
  staff: typeof staff;
  staffAuditLogs: typeof staffAuditLogs;
  staffMembers: typeof staffMembers;
  stripe: typeof stripe;
  tables: typeof tables;
  waitlist: typeof waitlist;
  waitlistConstants: typeof waitlistConstants;
  waitlistEngine: typeof waitlistEngine;
  waitlistQueries: typeof waitlistQueries;
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  stripe: import("@convex-dev/stripe/_generated/component.js").ComponentApi<"stripe">;
};
