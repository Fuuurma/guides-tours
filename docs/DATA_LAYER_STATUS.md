# Data layer status

This document tracks which backend modules are wired to the frontend
dashboard and which are data-layer only. Useful for planning future
UI work and for understanding what's safe to call from the FE today.

**Status as of 2026-07-19:** local calendar date math, `"skip"` query
patterns, slug-scoped public blackouts, schedule cancel, assignment
date validation, and expanded ops e2e smokes.

## Fully wired (FE calls + tests + production-ready)

These modules have one or more public Convex functions called from
`src/routes/dashboard/**` or `src/routes/book/**`, and they're covered
by integration tests:

| Module           | What works in the FE                                  |
|------------------|--------------------------------------------------------|
| `auth.ts`        | sign-up, sign-in, OAuth (Better Auth catch-all)        |
| `organizations.ts` | active org, slug lookup, org switcher, **listMembers** |
| `tours.ts`       | list/get/create/update + Categories filter             |
| `tourCategories.ts` | list/create/update/remove + enable/disable buttons  |
| `tourSchedules.ts` | create/update + **(tourId, date, startTime) uniqueness** + capacity on book/cancel |
| `tourTemplates.ts` | list/create/update/remove + enable/disable + Use Template (instantiate) |
| `tourBlackoutDates.ts` | list/create/remove on tour detail + **slug-scoped** `publicIsBlackout` |
| `tourSeasonalSchedules.ts` | CRUD + **generate** (materialize schedules) on tour detail |
| `tourExceptionDates.ts` | CRUD on tour detail                               |
| `tourImages.ts`   | list (with URLs) + add/update/remove/**reorder** gallery on tour detail |
| `files.ts`       | `generateUploadUrl` for tour image uploads             |
| `availabilities.ts` | guide availability month grid on `/dashboard/guides/$userId` |
| `customers.ts`   | list (search + VIP filter) + get + create/update + history |
| `assignments.ts` | list + create + complete + cancel + remove + conflict checker + **calendar** |
| `bookings.ts`    | list + create + edit + check-in + complete + cancel + record review + refund |
| `drivers.ts`     | list + create (org-member check) / update + activate/deactivate + remove |
| `vehicles.ts`    | list + create + status changer + remove                |
| `vacationRequests.ts` | list + create + approve + reject                   |
| `notifications.ts` | list + create/update + enable/disable + remove       |
| `notificationSettings.ts` | get + upsert (Twilio/SES + Messaging Service SID) |
| `notificationTemplates.ts` | list/create/update + preview + test send + **edit UI** |
| `notification_sms.ts` / `notification_dispatch.ts` | Twilio SMS via fetch + shared `renderNotification` (email + SMS bodies) |
| `ota/integrations.ts` + `ota/integrations_mutations.ts` | list + create + enable/disable + remove + secret masking |
| `otaProducts.ts` | list + create + remove on OTA dashboard                |
| `ota/router.ts`  | 7 webhook routes registered (Viator, GetYourGuide, Airbnb, TripAdvisor, Klook, Booking.com, Expedia) |
| `payments.ts` + `payments_stripe_actions.ts` | settings + **hosted Checkout** + **refundViaStripe** + webhook create-on-success + balance sync |
| `public_booking.ts` | slots + create + **canPay** for post-book Stripe Checkout |
| `webhookDeliveries.ts` | **listRecent** on OTA dashboard (OTA + Stripe) |
| `analytics.ts`   | overview KPIs + revenue summary (used by dashboard)    |

## Data-layer only (no FE wiring yet, but Convex + tests ready)

| Module                  | Status                                              |
|-------------------------|-----------------------------------------------------|
| `tourAnalytics.ts`      | Aggregated tour stats table. Use case: longer-range trends (90d+). |
| `files.ts` (full CRUD)  | Track/list generic files beyond tour-image uploads. |

## Internals (called by Convex, not exposed to FE)

These are `internal*` exports and are only callable from within
Convex. They have FE-facing `public*` counterparts in most cases.

| Function              | Wraps                                              |
|-----------------------|----------------------------------------------------|
| `internalCreate` / `internalUpdate` / `internalRemove` | public `create` / `update` / `remove` |
| `internalGenerate`    | `tourSeasonalSchedules.generate`                   |
| `internalAdd`         | `tourImages.add`                                   |
| `getTwilioConfig` / `recordSmsMessage` | SMS dispatch path                    |

## Test coverage

Run the full suite: `pnpm test` (689+) and `pnpm test:e2e` (Playwright: smoke + authenticated + ops).
Ops e2e covers calendar deep-link, guides availability, and gallery upload surface (`e2e/ops.spec.ts`).
