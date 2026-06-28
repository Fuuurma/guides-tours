# Changelog

All notable changes to guides-tours. Dates in YYYY-MM-DD.

## [Unreleased]

### OTA factory tests + blackout fix + assignment actions (2026-06-28 session 6)

**OTA webhook factory tests (10 new tests):**

- New `ota_webhook_factory.test.ts` pins the shared `createWebhookHandler` contract for all 7 OTA providers. Uses `t.fetch()` against the real router to exercise the full HTTP → factory → dispatch path end-to-end with real encrypted webhook secrets.
- Tests reject paths: missing signature (400), missing integrationId (400), wrong provider (400), inactive integration (410), invalid signature (401), stale timestamp (401), invalid JSON (400).
- Tests happy paths: unknown event type → 200 'ignored', valid booking.created → 200 'ok' + dispatches to upsert, valid booking.cancelled → 200 'ok' + dispatches to cancel.
- The 405 (non-POST) and 404 (unknown route) branches are enforced at the router layer (convex/ota/router.ts only registers POST handlers), so the factory's defense-in-depth checks for those are unreachable in production and not tested here.

**Public booking blackout fix (bug):**

- `public_booking.internalCreate` now calls `isBlackoutHelper(tourId, date)` before creating the booking. Throws "This date is not available for booking" on a blacked-out date.
- Previously, an operator could mark a date as "Closed for Christmas" but customers could still book it via the public page.
- 2 new tests cover single-day and multi-day blackout rejection.

**Assignment detail action buttons:**

- "Mark complete" button (visible when status === 'scheduled', uses `api.assignments.complete`, toast on success). This makes the guide role functional — previously guides had no way to mark their assignments complete from the UI.
- "Delete" button (visible when status !== 'completed', uses `api.assignments.remove` soft delete, `window.confirm()` safety check).
- "View tour" button now uses shadcn `Button asChild` + `Link` pattern (consistent with other detail pages).

**Tests: 551 passing** (up from 539, +12 net). **tsc clean**, **`pnpm build` clean**.

### Accessibility + inline errors (2026-06-28 session 5)

**Public booking page accessibility:**

- Field-level inline errors (`fieldErr` state) instead of just toast-only. Each field shows its own error message via `<p role="alert">` next to the input.
- `aria-invalid={true}` on inputs that have an error.
- Date validation added (was only checking date exists, not that it was picked).
- Submit-level error state (`submitErr`) shown in destructive alert box at bottom of form (rate limit exceeded, capacity full, etc).

**FormField accessibility:**

- Error message now has `role="alert"` + `id` for `aria-describedby` linking.
- Hint text gets `id` too. Screen readers announce errors when they appear.

**Security review:**

- Audited `bookings.create`, `customers.create/update/list`, `tourCategories`, `tourTemplates`, `tourBlackoutDates`, `otaProducts.create/update`, `assignments.create`, `vacationRequests`, `payments.upsertSettings`, `notifications`, `analytics` — all have proper org-scoping via `by_org` indexes + cross-org guards. No data leaks found.

**Tests: 539 passing** (unchanged — FE-only refactor). **tsc clean**, **`pnpm build` clean**.

### Last form validation pass (2026-06-28 session 4)

**Form validation completed for money/booking fields:**

- **new-booking-page**: per-field error display (guests, notes, deposit), guest count cap from selected tour's maxGuests, deposit cannot exceed total amount, `parseUsdToCents` helper for cents conversion (replaced inline BigInt math).
- **edit-booking-page**: per-field error display (guests, notes, deposit), deposit cannot exceed total, `maxLength` on all text fields, trim before submit.
- **edit-tour-page**: per-field error display (duration, capacity, min/max guests, description), `minGuests<=maxGuests` shows error on both fields, `parseUsdToCents` for price.

**Security review:**

- Audited `tourCategories`, `tourTemplates`, `tourBlackoutDates` — all have proper org-scoping via `by_org` indexes + `existing.organizationId !== orgId` guards on update/remove. No cross-org leak found.
- Audited `payments.upsertSettings` placeholder handling — verified working correctly.

**Tests: 539 passing** (unchanged — validation is FE-only refactor, no new tests). **tsc clean**, **`pnpm build` clean**.

### Form validation + index + tests (2026-06-28 session 3)

**Form validation expanded:**

- Applied `src/lib/validation.ts` helpers to **6 more dashboard forms**: `new-vehicle-page` (capacity + year range + maxLength on all fields), `new-vacation-page` (date range + maxLength notes), `new-assignment-page` (guide ID required + maxLength), `new-schedule-page` (end-after-start + capacity + maxLength), `new-template-page` (numeric fields + min<=max + maxLength + capped at 100 items), `new-notification-template-page` (retries >= 0 + maxLength), `edit-customer-page` (name/email/phone/notes validation + trim before submit).
- Pattern: `useState` per field for inline error display, passed to `<FormField error={...}>`. Errors clear on next keystroke. Throw from `mutation()` to block submit; `entity-form` already shows toast + sets inline error.

**Schema indexes:**

- Added `bookings.by_org_source_date` index on `(organizationId, source, date)`. The dashboard bookings list has an OTA source filter chip ("show only Viator bookings") — without this compound index, the BE would scan every org booking on each filter request. Verified via `npx convex codegen`.

**Entity form UX:**

- `entity-form` inline error now renders in a destructive-styled alert box (border + bg + `role="alert"`) instead of plain text. More visible + screen-reader friendly.

**New tests:**

- `src/__tests__/status-styles.test.ts` (7 tests): pin the status → badge variant/color mapping (no drift between `STATUS_CLASSES` and `STATUS_VARIANTS`, fallback behavior for unknown statuses).
- `convex/__tests__/audit.test.ts` (3 tests): pin the `logAudit` contract (row shape, timestamp auto-set, complex values preserved including bigints).

**Tests: 539 passing** (up from 529, +10). **tsc clean**, **`pnpm build` clean**, **Convex codegen clean**.

### Hardening + UX polish (2026-06-28 session 2)

**Performance fixes (N+1 query patterns):**

- **`_listByScheduleRaw` customer lookup** (`369dd77`): The schedule detail page was doing `Promise.all(active.map((b) => ctx.db.get(b.customerId)))` — N+1 query pattern. Fixed by deduping customerIds first and using a `Map<Id, Customer>` lookup. For a schedule with N bookings and U unique customers, the old code was 1+N lookups, now 1+U.
- **`assignments.checkConflicts` tour lookup** (`369dd77`): 3 nested loops (guide/vehicle/driver) each did `ctx.db.get(a.tourId)` per overlapping assignment. Refactored to collect all overlapping assignments into one array with conflict-type tags, dedupe tourIds, then one batched `Promise.all` + `Map` for tour names. For N conflicts the old code was O(N) tour lookups, now O(unique tours).

**Shared form validation:**

- **`src/lib/validation.ts`** (`b49f93d`): New shared validation helpers module — `EMAIL_REGEX`, `validateName`, `validateEmail`, `validatePhoneOptional`, `validateNotesOptional`, `validateDescriptionOptional`, `validatePositiveInteger`, `validatePositiveNumber`, `validateNonNegativeNumber`, `parseUsdToCents`. Centralizes the same patterns the public booking page uses so dashboard forms share validation logic.
- Applied to `new-customer-page` (name, email, phone, notes), `new-driver-page` (notes), OTA integrations form (maxLength=500 on secrets + JS-side empty-API-key guard).
- 32 new tests in `src/__tests__/validation.test.ts` (covering accept/reject/edge cases).

**Verified:**

- **`npx convex codegen`** runs successfully — schema is valid for deployment.
- **`pnpm build`** produces 615.78 kB server bundle (129.93 kB gzipped).

**Tests: 529 passing** (up from 497, +32 new). **tsc clean**, **`pnpm build` clean**.

### Hardening + UX polish (2026-06-28)

**Bugs fixed:**

- **Rate-limit outcome stuck as "pending"** (`960e009`): `recordAttempt` was always called with `outcome: "pending"` and never updated. Audit data showed pending forever, useless for distinguishing successful vs failed bookings. Added `attemptId` return value + `updateAttemptOutcome` internal mutation + try/catch wrapping the booking creation. 3 new tests.
- **`parseBookingTime` silently accepted rolled-over dates** (`62b09f2`): `Date.UTC(2026, 1, 31)` returns March 3 (Feb rollover), so `2026-02-31` was accepted and bookings could land on the wrong day. Added range checks + round-trip verification. 14 new tests in `convex/__tests__/time.test.ts`.
- **`customers.update` didn't normalize email** (`d941afe`): Inconsistent with `customers.create` which lowercases+trims before lookup. A user typing "Bob@Example.com" could create a duplicate of an existing "bob@example.com" customer.
- **`payments.upsertSettings` overwrote secrets with placeholder** (`13ade36`, from earlier session): The FE sends `"placeholder-no-change"` when secrets aren't changed (can't read them back for security). The BE was always encrypting and storing this literal value as the actual secret. Added placeholder detection + existing-ciphertext reuse. 1 new test.
- **OTA commission could go negative** (`a36849d`): Rate > 1 from a bad provider response or misconfigured product would produce commission > paid, flipping `netRevenueCents` below zero — silently corrupting revenue analytics. Clamp rate to `[0, 1]`. 2 new tests.

**Frontend improvements:**

- **Public booking form validation** (`62b09f2`): Email regex (RFC 5322-lite), name length (2-100), email max 254, phone digits (6-20) or empty, notes max 1000 + live char count, `maxLength` HTML attrs on every input.
- **Dashboard layout error state** (`af2d284`): Previously hung in "Loading…" forever on query failure. Added error card with Reload button.
- **Analytics + dashboard index error states** (`8b1e9e4`): Both pages now show user-visible error indicators when any query fails (was silent before).
- **Cancel booking form** (`c49ff88`): Uses `<Textarea>` instead of single-line `<Input>` for longer cancellation reasons. Destructive border tint to make the destructive nature obvious.
- **Dashboard upcoming assignments** (`c49ff88`): Tour name is now clickable to the tour detail page (was plain text).
- **Type safety** (`8aad4b5`): Narrowed 29 of 30 `as never` casts to `as Id<"table">` casts. The remaining 1 (entity-form navigate) is legitimately `as never` (dynamic typed route path).
- **Cents type consistency** (`4efca0f`, from earlier session): `v.int64()` returns `bigint` at runtime; FE interfaces now declare `bigint | number`.

**Code quality:**

- **`scheduledNotifications` cleanup** (`60d9320`): Replaced loose `{ db: { query: Function } }` type with proper `MutationCtx`, removed redundant null check.
- **`FE cents types`** (`4efca0f`, from earlier session): All cents fields in FE interfaces use `bigint | number` to match Convex `v.int64()` runtime type.

**Tests: 497 passing** (up from 461, +36 net new across 43 test files). **tsc clean**, **`pnpm build` clean**.

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
