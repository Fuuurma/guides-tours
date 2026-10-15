# guides-tours test-file audit — 2026-10-15

WORK row t-f9b2b35568 (work:368). Archetype-only review per Software Factory
`tech-stack/TESTING.md`: hunt tests that cannot fail, assert their own
fixture, re-implement the rule they claim to test, pin source text where a
behavioral seam exists, or duplicate another file. No automated classifier:
candidates came from grep (readFileSync, vi.mock of first-party modules,
"simulate", duplicate module imports) and every verdict below was hand-read.
Each rewrite was red-proven against a product mutation (diff confirmed
non-empty, then restored), and most against the replaced test as well.

Base `9264512` (shallow clone, origin/main). Measured: 120 test files
(116 vitest + 4 Playwright), not the 248 recorded 2026-10-04.

## Result

| | Before | After |
|---|---|---|
| vitest files | 116 | 112 |
| vitest tests | 1340 | 1187 |
| `pnpm test` exit | **1** (2 unhandled rejections) | 0 |
| `pnpm typecheck` | clean | clean |

The drop is mostly `schema.test.ts` (~99 generated regex cases -> 4). Every
deletion is a husk, a duplicate, or replaced by a behavioral test.

## Findings beyond per-file verdicts

1. **Red baseline hidden behind "116 passed".** Two F460 purge tests used
   `expect(promise).resolves` without `await`; both assertions failed after
   the test had passed, so vitest exited 1 while printing all-green counts.
2. **"convex-test cannot authenticate" was false in this repo.** Three files
   fell back to source-text pins on that claim while ten sibling files drive
   real mutations through `vi.mock("../auth")`. All three now use the seam.
3. **The Stripe webhook dispatcher was never executed by any test.** It is an
   httpAction and convex-test's `t.fetch` drives it; the F555 guard is now
   pinned end-to-end.
4. **Retention nuance (product, not changed):** `purgeArchivedAssignments`
   scans `by_status_date < cutoff` before checking `deletedAt`, so a future
   departure archived long ago is not purged until its departure date also
   ages past 365 days. Retention is "at least", not "exactly", 365 days after
   archive. Owner call whether that is intended.

## Per-file verdicts

| File | Tests (base) | Verdict | Note |
|---|---|---|---|
| `convex/__tests__/analytics.test.ts` | 25 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/analyticsBuilders.test.ts` | 9 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/assignmentCompleteAuthz.test.ts` | 3 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/assignmentNotifications.test.ts` | 5 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/assignments.test.ts` | 32 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/assignmentsLifecycle.test.ts` | 29 | rewrite | (a) 5 readFileSync pins claimed convex-test cannot authenticate; 10 sibling files mock ../auth. Replaced by 5 real calls (foreign guide refused on update/create, own guide accepted, no recheck without guideId, internalUpdate unguarded). Old pins stayed green with the guard rejection swallowed. (b) F460 purge tests used un-awaited `.resolves` - they failed AFTER passing (pnpm test exit 1 on base) and the fixture dates kept every row out of the by_status_date scan. Awaited + realistic departure dates; red-proven by dropping the deletedAt filter. |
| `convex/__tests__/audit.test.ts` | 3 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/auth_oauth.test.ts` | 4 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/auth_security.test.ts` | 20 | rewrite (trim) | 2 isGoogleEnabled tests deleted: one exact duplicate of auth_oauth, one typeof-boolean tautology. |
| `convex/__tests__/authz-membership.test.ts` | 7 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/authz.test.ts` | 4 | rewrite | "every declared role is accounted for" was proven by tsc (ALL_ROLES: RoleName[]); now asserts ALL_ROLES == keys(roles) both ways. Red-proven with an extra role. |
| `convex/__tests__/availabilities.test.ts` | 9 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/availabilityReminders.test.ts` | 3 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/awsSigV4.test.ts` | 7 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/bookingCapacityClaim.test.ts` | 6 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/bookingExpiryPaidGuard.test.ts` | 4 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/bookingStateMachine.test.ts` | 6 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/bookings.test.ts` | 35 | rewrite (trim) | 7 husks deleted: "schema invariants", "terminal-state guards", "balance math" blocks seeded rows with ctx.db and asserted the fixture; no product call. Guards they name are pinned in bookingsLifecycle + internalUpdate/internalComplete blocks. |
| `convex/__tests__/bookingsLifecycle.test.ts` | 36 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/bookingsListCustomerName.test.ts` | 5 | rewrite (1 test) | bookings.list source pin -> real api.bookings.list call through the ../auth seam (names for customers outside a 20-row page). FE "no route rebuilds a name map" pin kept as a lint-style rule. |
| `convex/__tests__/crypto.test.ts` | 9 | delete (merged) | Duplicate of convex/lib/__tests__/crypto.test.ts; unique malformed-input cases (two-part, non-hex iv) folded there. |
| `convex/__tests__/customers.test.ts` | 15 | rewrite | 3 husks deleted (2 fixture echoes; ALLOWED_UPDATE_FIELDS test asserted a local Set). F365 consent test re-implemented the rule inline - replaced by 3 calls to api.customers.update via the ../auth seam (consent no-restamp, false->true stamp/revoke, email normalize+uniqueness). Red-proven; old F365 test stayed green with the bug reintroduced. |
| `convex/__tests__/drivers.test.ts` | 13 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/emailSeams.test.ts` | 8 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/files.test.ts` | 6 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/files_remove_gate.test.ts` | 4 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/http-booking-error-map.test.ts` | 7 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/immediate_dispatch.test.ts` | 6 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/notificationRender.test.ts` | 5 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/notificationSettings.test.ts` | 5 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/notificationTemplates.test.ts` | 10 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/notification_dispatch.test.ts` | 7 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/notification_sms.test.ts` | 3 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/ops.test.ts` | 5 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/organizations.test.ts` | 8 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/otaProducts.test.ts` | 10 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/ota_integrations.test.ts` | 9 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/ota_integrations_mutations.test.ts` | 10 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/ota_upsert_commission.test.ts` | 18 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/ota_webhook_factory.test.ts` | 22 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/ota_webhook_integration.test.ts` | 6 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/ota_webhook_remaining.test.ts` | 11 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/ota_webhook_verify.test.ts` | 26 | delete (merged) | Duplicate of convex/ota/__tests__/webhook_verify.test.ts; unique cases (64-char non-hex + fromHex, custom maxAgeMs, stale-before-signature, bad-sig reason) ported. |
| `convex/__tests__/payments.test.ts` | 42 | keep (+1 case) | Added behavioral Stripe-secret encryption-on-write (replaces two schema alias pins). Red-proven. |
| `convex/__tests__/payments_stripe_actions.test.ts` | 29 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/payments_stripe_webhook.test.ts` | 14 | rewrite | Dispatch tests called markX directly (duplicating payments.test.ts) and F555 tests asserted the decision table beside an untouched row. Now 7 signed POSTs through /api/payments/stripe/webhook via t.fetch + the cross-org query test. With F555 reintroduced (payment_status dropped) the old file and old source pins stayed green; 3 new tests fail. |
| `convex/__tests__/phoneReminderClaim.test.ts` | 5 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/phoneReminderCooldownLookup.test.ts` | 4 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/phoneReminders.test.ts` | 2 | keep | Retention > cooldown is a real cross-module invariant. |
| `convex/__tests__/processNotifications.test.ts` | 4 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/public_booking.test.ts` | 27 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/public_booking_exceptions.test.ts` | 11 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/public_booking_http.test.ts` | 11 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/public_booking_http_cross_tenant.test.ts` | 8 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/public_booking_http_security.test.ts` | 21 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/public_booking_security.test.ts` | 4 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/rate_limit.test.ts` | 13 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/scheduledNotifications.test.ts` | 6 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/staffingDigest.test.ts` | 6 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/staffingGaps.test.ts` | 13 | delete (moved) | Richer of two files on lib/staffingGaps; content moved to convex/lib/__tests__/staffingGaps.test.ts. |
| `convex/__tests__/stripeEvents.test.ts` | 5 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/time.test.ts` | 18 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/tourAnalytics.test.ts` | 9 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/tourAvailability.test.ts` | 5 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/tourBlackoutDates.test.ts` | 10 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/tourCategories.test.ts` | 6 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/tourExceptionDates.test.ts` | 10 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/tourImages.test.ts` | 8 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/tourSchedules.test.ts` | 13 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/tourSchedulesUniqueness.test.ts` | 2 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/tourSeasonalGenerate.test.ts` | 8 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/tourSeasonalGenerateDuplicates.test.ts` | 2 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/tourSeasonalSchedules.test.ts` | 7 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/tourTemplates.test.ts` | 7 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/tours.test.ts` | 17 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/userProfiles.test.ts` | 9 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/vacationRequests.test.ts` | 32 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/vehicles.test.ts` | 13 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/__tests__/webhookDeliveries.test.ts` | 17 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/lib/__tests__/checkoutSettlement.test.ts` | 10 | rewrite (trim) | 2 "source shape, not executed" pins deleted - the dispatcher now runs in payments_stripe_webhook.test.ts. Decision-table tests kept. |
| `convex/lib/__tests__/crypto.test.ts` | 13 | keep (+2 cases) | Receives the two unique malformed-input assertions. |
| `convex/lib/__tests__/inviteEmail.test.ts` | 4 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/lib/__tests__/phoneRemindCooldown.test.ts` | 5 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/lib/__tests__/schema.test.ts` | 10 | rewrite | ~99 generated regex pins over schema.ts text -> 4 tests over schema.export() (tenant org field, required + by_org-led indexes, every *Cents is int64, v.any allowlist). Old file stayed green with drivers.organizationId commented out and with costCents as float64; new file fails all three mutations. |
| `convex/lib/__tests__/sendEmail.test.ts` | 6 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/lib/__tests__/staffing.test.ts` | 10 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/lib/__tests__/staffingGaps.test.ts` | 9 | rewrite (merged) | Now the merged file: richer suite + car-tour inference via computeStaffingGaps + per-gap assignment deep link. |
| `convex/lib/__tests__/userContact.test.ts` | 3 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/lib/__tests__/validation.test.ts` | 31 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/notifications/__tests__/crons.test.ts` | 4 | rewrite (1 test) | Schedule-shape regex (matched `minutes: 5` anywhere) -> asserts the cronJobs() registry: function + schedule per job. Old regex stayed green when process_pending_notifications went to 15 min. |
| `convex/ota/__tests__/normalize.test.ts` | 33 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `convex/ota/__tests__/webhook_verify.test.ts` | 20 | keep (+4 cases) | Independent Node HMAC oracle; empty beforeEach husk removed. |
| `src/__tests__/analytics-presets.test.ts` | 7 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/auth-callback.test.ts` | 2 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/booking-hero.test.tsx` | 10 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/calendar.test.tsx` | 10 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/dashboard-index-errors.test.tsx` | 2 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/edit-booking-validation.test.ts` | 9 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/error-display-seam.test.ts` | 1 | keep | Deliberate lint-pin over src for F724 (raw getErrorMessage at display sites); behavioral twin is error-message.test.ts. |
| `src/__tests__/error-message.test.ts` | 6 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/format.test.ts` | 14 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/ota-providers.test.ts` | 5 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/pending-invites-section.test.tsx` | 6 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/public-booking-link-bar.test.tsx` | 4 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/skeleton.test.tsx` | 4 | delete | Pinned class strings and attribute pass-through of a vendored shadcn primitive; no product behavior. |
| `src/__tests__/staff-departure-form.test.tsx` | 6 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/status-styles.test.ts` | 4 | keep | Mapping coverage; title says 16 statuses, lists 20 (cosmetic). |
| `src/__tests__/time.test.ts` | 7 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/tour-option.test.tsx` | 5 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/tour-revenue-bars.test.ts` | 2 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/tour-template-validation.test.ts` | 7 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/tour-type-field.test.tsx` | 3 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/use-today-ymd.test.tsx` | 2 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/__tests__/validation.test.ts` | 34 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/lib/__tests__/calendar-date.test.ts` | 6 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `src/lib/__tests__/invitations.test.ts` | 9 | keep | Behavior at a seam (convex-test mutations/queries, pure helpers, or RTL render). |
| `e2e/smoke.spec.ts` | 7+ | rewrite (not executed) | "root page renders marketing copy" asserts `page.url().startsWith("http")` - always true; goto does not throw on a 500. Should assert `response.status() < 500` like its siblings. Other route-reachability tests drive real pages. |
| `e2e/authenticated.spec.ts` | 4 | keep | Real sign-up -> onboarding -> dashboard and sign-in flows; public booking page for a real slug. |
| `e2e/booking-journey.spec.ts` | 1 | keep | Full operator journey: schedule, assign, confirm, reschedule, blackout, cancel. |
| `e2e/ops.spec.ts` | 4 | keep | Drives calendar deep-link, guides availability grid, gallery control, OTA panel. |

e2e specs run only in the SF daily-tests sweep (not CI), per doctrine; they
were reviewed statically and not executed in this pass.
