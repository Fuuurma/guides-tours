# Changelog

All notable changes to guides-tours. Dates in YYYY-MM-DD.

## [Unreleased]

### Security hardening (sessions of 2026-06-24 through 2026-06-27)

Captured retrospectively as a single release entry.

**Backend hardening:**
- **Public booking rate limit + origin check** (`d64dde1`): 5 attempts/email/15min sliding window via new `publicBookingAttempts` table; `PUBLIC_BOOKING_ALLOWED_ORIGINS` env var for prod origin allowlist; cron cleanup at 04:30 UTC. Closes pre-deploy brute-force risk on `public_booking.internalCreate`.
- **OTA webhook timestamp/replay protection** (`91fd5db`): HMAC-SHA256 over body + 5-min timestamp window; rejects old captured payloads even with valid signature. Applied to all 7 OTA providers (Viator, GetYourGuide, Airbnb, Klook, Tripadvisor, Booking.com, Expedia). Tested with RFC 4231 vector + per-provider integration tests.
- **Stripe webhook cross-tenant validation** (`a9b4c0a`): `getPaymentByIntent` now requires `organizationId` arg, returns null on mismatch. Prevents cross-tenant payment attribution from spoofed webhook lookups.
- **Schedule ↔ booking atomic linking** (`480df4b`): `bookings.scheduleId` field + `bookings.create` atomically calls `tourSchedules.incrementBooked` (rolls back on over-capacity); `internalCancel` reuses `performCancel` helper, prefers explicit `scheduleId` over `(tourId, date, startTime)` lookup, best-effort if no schedule row exists.
- **Public booking date validation** (`c9df225`): rejects past dates + malformed date/time + enforces `tour.bookingCutoffHours`. Extracted shared `parseBookingTime` regex parser in `convex/lib/time.ts`.
- **Immediate booking-confirmation email** (`0b04ac0`): `dispatchImmediateBookingConfirmation` action + `getBookingForImmediateDispatch` query + `recordImmediateDispatchResult` audit log. Wired into both `bookings.create` (internal) and `public_booking.internalCreate`.
- **Analytics IDOR fix**: removed `organizationId` arg from 7 analytics queries (`getOverview`, `getTourStats`, `getGuideStats`, `getDailyStats`, `getRevenueSummary`, `getTopTours`, `getBookingSources`); org derived from session via `requireMembership`. Internal mirrors (`*Internal`) take orgId directly for tests.
- **Bookings.update security**: `status` field removed from update args to prevent state-machine bypass (state transitions go through `checkIn` / `complete` / `cancel` mutations only).
- **recordReview**: only accepts `completed` bookings (was accepting any status).

**Frontend hardening:**
- **All raw `<select>`/`<textarea>`/`<input type="checkbox">` removed from dashboard** (public booking page keeps radio card picker — intentional UX): every form now uses official shadcn primitives built on radix-ui.
- **EntityFormPage + useEntityForm**: shared form shell + state hook. Eliminated 12 pages of duplicated `useState` + `pending` + `error` + `try/catch` + `navigate` boilerplate.
- **DetailPage + DetailSection + MetricCard + DetailRow + DetailLinkRow**: shared detail-page primitives. Eliminated duplicated status cards + metric grids across 8 detail pages.
- **ListPage + StatusBadge + status-styles**: shared list page primitive + centralized `STATUS_CLASSES` / `STATUS_VARIANTS` map. Migrated all 8 list pages.
- **Edit pages migrated**: edit-booking-page, edit-tour-page (added missing `tourType`/`categoryId`/`languages`/`templateId` fields), edit-customer-page (this session).

**Backend feature work:**
- **Categories** (`4ab8d8` + `e7d752c`): new `tourCategories` table + dashboard `/dashboard/categories` management page; `tours.categoryId` field wired through schema/create/update/list with cross-org validation in `internalUpdate`.
- **Schedules list enhancements** (`d86f9a6`): shows tour name + status chips.
- **Assignments list enhancements** (`968a076`): shows tour name + status chips.
- **Dashboard index/analytics/notifications detail** (`4e638b8`): migrated to shared `MetricCard` / `DetailPage` / `StatusBadge`.
- **Bookings source filter** (`307bde6`): `bookings.list` accepts `source` arg + chip-based filter UI.
- **Analytics surfaces top tours + bookings-by-source** (`98ce361`): `getTopTours` + `getBookingSources` queries now rendered (was dead code).
- **Dashboard upcoming assignments** (`da78ea3`): shows tour names + clickable links.
- **Date-range filters** (`04a207f`): from/to inputs + "Last 30 days" reset on bookings/assignments/schedules lists.
- **Customers VIP/Regular filter** (`3310b3f`): uses existing `vipOnly` arg.
- **Min date on date inputs** (`cbe9824`): browser-side prevents past-date booking before reaching server.
- **listBySchedule query** (`759e9e0`): schedule roster with customer name/email enrichment; org-scoping defense in depth; filters out cancelled bookings. Wired into schedule detail page.

**Infrastructure:**
- **pnpm 10.30.2 standard**: `"packageManager"` field in `package.json`, `pnpm-lock.yaml` source of truth, deleted stray `package-lock.json`, all scripts use `pnpm`.
- **Playwright smoke** (`94baf80` + `e2e/smoke.spec.ts`): 20+ tests covering all 15 dashboard routes + auth flows + public booking page.
- **Edge-runtime documentation** (`docs/EDGE-RUNTIME.md`): explains why we use custom SigV4 + raw Stripe `fetch` instead of official SDKs (avoids `"use node"` directive in Cloudflare Workers + Convex default runtime).
- **README refresh** (`d06f90a`): rewritten from "Phase 2 Foundation" copy to current state (47 routes, 33 tables, 461 tests).

**Tests:**
- **461 passing** (up from 0 at session start), 42 test files
- **+66 net tests** this session (rate_limit + immediate_dispatch + OTA webhook verify + payments_stripe_webhook cross-org + bookings internalUpdate + public_booking edge cases + OTA remaining providers + bookings schedule wiring + listBySchedule internal + vacationRequests internalGetStats)
- **tsc clean**, **`pnpm build` clean**

## Earlier

- See `git log --oneline` for the migration-era commits (Phase 1 through Phase 47, ~70 commits establishing the canonical guides-tours repo from `reservations-automation` + `tour-management-saas` source repos).
