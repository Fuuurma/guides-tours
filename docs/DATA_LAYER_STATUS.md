# Data layer status

This document tracks which backend modules are wired to the frontend
dashboard and which are data-layer only. Useful for planning future
UI work and for understanding what's safe to call from the FE today.

**Status as of 2026-07-20:** Stripe Payment Element + tourAnalytics chart;
fleet edit; tour/schedule delete; tour-image file tracking.

## Fully wired (FE calls + tests + production-ready)

These modules have one or more public Convex functions called from
`src/routes/dashboard/**` or `src/routes/book/**`, and they're covered
by integration tests:

| Module           | What works in the FE                                  |
|------------------|--------------------------------------------------------|
| `auth.ts`        | sign-up, sign-in, OAuth (Better Auth catch-all)        |
| `organizations.ts` | active org, slug lookup, org switcher, **listMembers** (+ **phone enrichment**) |
| `tours.ts`       | list/get/create/update/**soft-delete** + Categories filter + **staffing rules** |
| `tourCategories.ts` | list/create/update/remove + enable/disable buttons  |
| `tourSchedules.ts` | create/update/**delete** + **(tourId, date, startTime) uniqueness** + capacity on book/cancel |
| `tourTemplates.ts` | list/create/update/remove + enable/disable + Use Template (instantiate) + **staffing fields** |
| `tourBlackoutDates.ts` | list/create/remove on tour detail + **slug-scoped** `publicIsBlackout` |
| `tourSeasonalSchedules.ts` | CRUD + **generate** (materialize schedules) on tour detail |
| `tourExceptionDates.ts` | CRUD on tour detail                               |
| `tourImages.ts`   | list (with URLs) + add/update/remove/**reorder** gallery (**tracks files**) |
| `files.ts`       | **list/get/remove** Files admin + `generateUploadUrl` + **internalTrack** from gallery |
| `availabilities.ts` | guide availability month grid on `/dashboard/guides/$userId` |
| `userProfiles.ts` | **getContact** + **updatePhone** + **missingStaffPhones** (staffing + home) |
| `phoneReminders.ts` | **sendReminders** + **cooldownStatus** + **purgeOldSends** cron + digest opt-in |
| `staffingDigest.ts` | daily cron + **sendNow** + missing-phone section + **phoneRemindWithDigest** |
| `customers.ts`   | list (search + VIP filter) + get + create/update + history |
| `assignments.ts` | list + create + **update staffing** + complete + cancel + remove + conflict checker + **calendar** + multi-guide / fleet rules + **staffingGaps** + **slotCompanions** + **guide/driver notify** |
| `bookings.ts`    | list + create + edit + check-in + complete + cancel + record review + refund |
| `drivers.ts`     | list + create (org-member check) / **update** + activate/deactivate + remove + **upcoming** + **phone/SMS cue** |
| `vehicles.ts`    | list + create + **edit** + status changer + remove + **upcoming** + **driver SMS cue** |
| `vacationRequests.ts` | list + create + approve + reject                   |
| `notifications.ts` | list + create/update + enable/disable + remove       |
| `notificationSettings.ts` | get + upsert (Twilio/SES + digest + **phoneRemindWithDigest** + assignmentNotify) |
| `availabilityReminders.ts` | daily cron + **sendNow** — email guides with unmarked days |
| `assignmentNotifications.ts` | guide + driver notify + **sendTest** + **resend** (opt-out) |
| `notificationTemplates.ts` | list/create/update + preview + test send + **edit UI** |
| `notification_sms.ts` / `notification_dispatch.ts` | Twilio SMS via fetch + shared `renderNotification` (email + SMS bodies) |
| `ota/integrations.ts` + `ota/integrations_mutations.ts` | list + create + enable/disable + remove + secret masking |
| `otaProducts.ts` | list + create + remove on OTA dashboard                |
| `ota/router.ts`  | 7 webhook routes registered (Viator, GetYourGuide, Airbnb, TripAdvisor, Klook, Booking.com, Expedia) |
| `payments.ts` + `payments_stripe_actions.ts` | settings + **hosted Checkout** + **Payment Element** (PI + clientSecret) + **refundViaStripe** + webhook |
| `public_booking.ts` | slots + create + **canPay** + publishable key for Elements |
| `webhookDeliveries.ts` | **listRecent** on OTA dashboard (OTA + Stripe) |
| `analytics.ts`   | overview KPIs + revenue + **getTourStats** / **getForTour** (analytics page + tour detail) |
| `tourAnalytics.ts` | Daily cache refresh cron + **list** charted on analytics |

## Data-layer only (no FE wiring yet, but Convex + tests ready)

_(none — files admin is wired)_

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

Run the full suite: `pnpm test` (743) and `pnpm test:e2e` (Playwright: smoke + authenticated + ops).
Ops e2e covers calendar deep-link, guides availability, gallery upload,
staffing readiness / multi-guide gap strip / phone-remind settings, analytics,
payment settings + booking collect (Elements/Checkout), files admin, and OTA
surface (`e2e/ops.spec.ts`). Smoke includes `/dashboard/files`.
