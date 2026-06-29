# Data layer status

This document tracks which backend modules are wired to the frontend
dashboard and which are data-layer only. Useful for planning future
UI work and for understanding what's safe to call from the FE today.

**Status of the migration as of 2026-06-29:** all 47 dashboard routes
ship, all critical workflows (auth, booking, public booking, OTA,
payments) work end-to-end. The gaps below are "nice to have" features
where the data model and Convex queries exist but no UI exposes them
yet.

## Fully wired (FE calls + tests + production-ready)

These modules have one or more public Convex functions called from
`src/routes/dashboard/**` or `src/routes/book/**`, and they're covered
by integration tests:

| Module           | What works in the FE                                  |
|------------------|--------------------------------------------------------|
| `auth.ts`        | sign-up, sign-in, OAuth (Better Auth catch-all)        |
| `organizations.ts` | list my orgs, switch active org, slug lookup         |
| `tours.ts`       | list/get/create/update + Categories filter             |
| `tourCategories.ts` | list/create/update/remove + enable/disable buttons  |
| `tourSchedules.ts` | create + capacity tracking on book/cancel            |
| `tourTemplates.ts` | list/create/update/remove + enable/disable buttons   |
| `customers.ts`   | list (search + VIP filter) + get + create/update + history |
| `assignments.ts` | list + create + complete + cancel + remove             |
| `bookings.ts`    | list + create + edit + check-in + complete + cancel + record review |
| `drivers.ts`     | list + create/update + activate/deactivate + remove    |
| `vehicles.ts`    | list + create + status changer + remove                |
| `vacationRequests.ts` | list + create + approve + reject                   |
| `notifications.ts` | list + create/update + enable/disable + remove       |
| `notificationSettings.ts` | get + upsert (Twilio/SES credentials)         |
| `notificationTemplates.ts` | list + create/update + enable/disable + remove |
| `ota/integrations.ts` + `ota/integrations_mutations.ts` | list + create + enable/disable + remove + secret masking |
| `ota/router.ts`  | 7 webhook routes registered (Viator, GetYourGuide, Airbnb, TripAdvisor, Klook, Booking.com, Expedia) |
| `payments.ts`    | public settings (Stripe + Twilio masked) + upsert + webhook handler |
| `public_booking.ts` | `getOrgAndToursBySlug` + `createForSlug` action     |
| `analytics.ts`   | overview KPIs + revenue summary (used by dashboard)    |

## Data-layer only (no FE wiring yet, but Convex + tests ready)

These modules have working Convex schemas, queries, mutations, and
test coverage. The FE doesn't call them today — they're reserved for
upcoming UI work. Safe to call from new dashboard routes.

| Module                  | Status                                              |
|-------------------------|-----------------------------------------------------|
| `files.ts`              | Storage upload URL + track metadata. Use case: customer documents, tour images. |
| `tourImages.ts`         | Per-tour image gallery. Use case: marketing site tour photos. |
| `otaProducts.ts`        | OTA product cache (linked from otaBookings). Use case: cross-reference Viator/Klook products. |
| `tourAnalytics.ts`      | Aggregated tour stats table. Use case: longer-range trends (90d+). |
| `tourExceptionDates.ts` | Per-tour date overrides. Use case: "this tour doesn't run on holidays". |
| `tourSeasonalSchedules.ts` | Recurring weekly schedule generator. Use case: "every Saturday at 9am". |
| `tourBlackoutDates.ts`  | Blackout window table (the `isBlackout` query is exported but no FE caller). Use case: closure calendar. |

## Internals (called by Convex, not exposed to FE)

These are `internal*` exports and are only callable from within
Convex. They have FE-facing `public*` counterparts in most cases.

| Function              | Wraps                                              |
|-----------------------|----------------------------------------------------|
| `internalCreate` / `internalUpdate` / `internalRemove` | public `create` / `update` / `remove` (auth + validation lives in public) |
| `internalListBySchedule` | `bookings.listBySchedule` (bypasses auth — used by tests + cross-table calls) |
| `internalGetStats`    | `vacationRequests.getStats`                        |
| `internalSetStatus`   | `vehicles.setStatus`                               |
| `internalSetActive`   | `drivers.setActive`                                |
| `internalUpsert`      | `notificationSettings.upsert`                      |
| `internalComplete` / `internalCancel` | `bookings.complete` / `bookings.cancel` |
| `internalTrack`       | `files.track`                                      |
| `internalApprove` / `internalReject` | `vacationRequests.approve/reject` |
| `internalAdd`         | `tourImages.add`                                   |
| `internalCancel`      | `assignments.cancel`                                |
| `internalComplete`    | `assignments.complete`                             |
| `internalRecord`      | `tourAnalytics.record`                             |
| `internalUpdate`      | (per-resource)                                      |
| `analytics.ts`        | `getDailyStatsInternal` / `getGuideStatsInternal` / `getTourStatsInternal` / `getTopToursInternal` — used by tests only |

## Dead public surface (called by nothing, intentional or stale)

Public functions with no FE caller AND no internal caller. The plan
is to either wire them up or remove them in a future cleanup pass.
None of these block the deploy.

- `bookings.refund` (manual refund — Stripe webhook handles automatic)
- `tourImages.add` (public version — only the internal one is wired)
- `tourImages.generateUploadUrl` (public version — only the `files.generateUploadUrl` is wired)
- `notifications.instantiate` (template instantiation helper — not yet needed)
- `customers.getBookingSources` (public version — internal mirror is used)
- `tourTemplates.instantiate` (template clone — no FE button yet)
- `assignments.checkConflicts` (public query wrapper around `checkConflictsHelper` — could be used for FE pre-flight validation)
- `tourBlackoutDates.isBlackout` (public query wrapper around `isBlackoutHelper` — could be used for FE pre-flight validation)
- `files.getUrl` (storage URL fetcher — not yet needed)
- `files.track` (public version of file metadata write — internal version is used)
- `notificationSettings.getSecrets` (Twilio auth token decrypt — UI uses separate form to avoid leaking the token to the client)
- `organizations.setActiveOrganization` (Better Auth internal — should use `auth.api.setActiveOrganization` from the FE)
- `organizations.listMyOrganizations` (no "switch org" UI yet)

## Unused indexes (declared in schema, no query uses them)

Convex doesn't auto-prune unused indexes; they're just extra storage.
Left in place to avoid a schema migration. Safe to remove in a future
cleanup if size becomes a concern.

- `bookings.by_org_status` (bookings.list uses by_org_date + JS filter)
- `customers.by_org_next_booking` (`nextBookingDate` field is set by
  bookings.create but never queried)
- `customers.by_org_name` (no name-based queries today)

## Test coverage

All wired modules are covered by `convex/__tests__/**.test.ts` and
the `e2e/smoke.spec.ts` Playwright suite. The data-layer-only modules
are covered by their own unit tests — they're working code, they just
lack a UI consumer.

To run the full suite: `pnpm test` (562 tests) and
`pnpm test:e2e` (Playwright smoke).
