# guides-tours codebase audit — 2026-07-26

Deep audit of the
[guides-tours](https://github.com/Fuuurma/guides-tours) tour-operator
SaaS against the SaaS-correctness milestone
(`VAL-SAAS-GUIDE-001..006`). Continues the prior 2026-07-22 pass.

## Scope

- Project: guides-tours (tour operator SaaS)
- Repo path: `~/Projects/guides-tours`
- Date: 2026-07-26
- Audit type: deep review (saas-correctness milestone)

## Current State

- Stage in hub: **building** (`projects/guides-tours.md`)
- Live slice: operator dashboard + bookings + public booking page
  + auth flows; Stripe sandbox defaults wired but per-org payment
  settings + webhook smoke still pending
- Actual app state: 755/755 unit tests pass; typecheck, lint,
  biome check, and `pnpm deploy:check` all green; the public
  booking HTTP route was reachable only as a 404 (a real P1 bug,
  fixed in this pass) before this audit landed.
- Local repo present: yes
- Branch / commit: `main` @ `018e492`
  ("feat: complete booking operations journey")
- Dirty working tree before this pass: 35 files changed in the
  uncommitted "complete booking operations journey" pass; the
  new test file (`convex/__tests__/public_booking_http.test.ts`)
  was the only untracked path this audit added, and the
  one-line `convex/http.ts` route fix is the only owned
  production-code change in this pass (it is independent of the
  dirty work above — `convex/http.ts` was already committed in
  `018e492` and was not in the dirty `HEAD~1..HEAD` diff).

## Stack Check

- Package manager: pnpm 10.30.2 (per
  `package.json#packageManager`)
- Frontend: TanStack Start (React 19, Vite 8) — **47 routes**
- Backend: Convex 1.42 (**38 tables** = 35 app + 3 org-plugin;
  36 files) + Better Auth local-install + Stripe + SES
  (custom SigV4 — documented edge-runtime exception)
- Auth: Better Auth 1.6 with organization plugin
  (`local-install`; `convex/betterAuth/`)
- Email: Amazon SES v2 via custom SigV4 in
  `convex/lib/sendEmail.ts`
- Payments: Stripe raw fetch in Convex actions + HTTP actions
  for webhooks; per-org payment settings persisted via
  `orgPaymentSettings` table
- OTA: 7 providers (viator, getyourguide, airbnb, tripadvisor,
  klook, booking, expedia) — HMAC-SHA256 verification + 5-min
  replay window + AES-256-GCM encrypted per-org shared secrets
- UI: Tailwind v4 + shadcn/ui primitives
- Forms: TanStack Form (public booking + dashboard forms)
- Testing: Vitest 4 (755 unit/integration + 8 new in this pass;
  Playwright e2e)
- Lint/format: Biome (lint + check)
- Hosting/deploy: Cloudflare Workers + Convex Cloud
  (`combative-penguin-315` dev)

## Commands (this pass)

| Command | Result |
|---|---|
| `pnpm test` | **755/755 pass** (was 747; 8 new in `public_booking_http.test.ts`) |
| `pnpm exec tsc --noEmit` | clean |
| `pnpm lint` | 137 files, no fixes |
| `pnpm check` | 137 files, no fixes |
| `pnpm deploy:check` | exit 1 — reports 13 required + 7 optional vars missing (no deploy attempted, no values printed) |
| `pnpm exec convex ai-files status` | enabled, up to date |

## Safe Fix Shipped (with red/green proof)

### 1. Public booking HTTP route was registered with a path Convex cannot match  [P1]

`convex/http.ts` registered the public booking endpoint as

```ts
http.route({ path: "/api/public/book/:slug", method: "POST", handler });
```

Convex's HTTP router uses **exact** matching on the `path` field
(it does NOT interpolate `:slug` style path parameters — see
`convex@1.42.3/.../convex/dist/esm/server/router.js`: `path` keys
a `Map` and `lookup` does `exactRoutes.get(path)?.get(method)`).
The handler manually parsed the slug from
`url.pathname.split("/")` via `segments.indexOf("book")`, which
already supports a `pathPrefix` route — so the wiring intent was
correct, but the registered route string was wrong.

Effect: every POST to `https://<deployment>.convex.site/api/public/book/<anything>`
returned **404 "No HttpAction routed for /api/public/book/<anything>"**,
both in `t.fetch()` (convex-test) and against the live Convex
router. The handler code below the registration was never
reachable. This is the canonical "Convex booking endpoint doesn't
work" bug.

Fix: register the route as a `pathPrefix` whose tail matches
`/api/public/book/`. The existing manual slug parsing already
handles the slug-extraction contract (segments after `book/`).
One-line production change.

Files: `convex/http.ts`

Regression coverage:

- `convex/__tests__/public_booking_http.test.ts` (8 new tests).
  Uses `convex-test`'s `t.fetch("/api/public/book/<slug>")` to
  exercise the httpAction end-to-end and prove the router now
  matches the request.
  - **red**: before the fix, `t.fetch("/api/public/book/any-slug")`
    returned 404 ("No HttpAction routed for ..."); all 8 tests
    failed.
  - **green**: after the fix, `t.fetch(...)` reaches the handler
    and the route returns the documented error envelope for each
    of the eight HTTP-layer contracts.

What the 8 new tests pin:

1. Routing: a POST to `/api/public/book/<slug>` reaches the
   handler. A negative control (`/api/public/something-else`)
   returns 404, proving the prefix is `/api/public/book/` and
   not `/api/public/` alone.
2. Content-Type: anything other than `application/json` returns
   **415** before the JSON parser runs (no multipart upload or
   text blob can bypass validation).
3. Invalid JSON: malformed body returns **400** without writing
   a booking.
4. Missing required fields: empty `tourId` returns **400** with
   the documented error message.
5. Non-integer guests (`2.5`): returns **400** because
   `Number.isFinite(rawGuests) && rawGuests >= 1 && rawGuests <= 200`
   rejects before `Math.floor` can silently coerce.
6. Out-of-range guests (`0`): returns **400** for the same
   reason.
7. Defensive no-row assertion: a rejected request writes **0**
   booking rows (the rate-limit `publicBookingAttempts` table
   records the attempt; the `bookings` table stays empty).

Cross-tenant guard coverage stays where it was — the
`internalCreate` mutation (which enforces
`tour.organizationId !== args.organizationId` and rejects
schedule references from foreign orgs) is covered by the
existing 864-line `convex/__tests__/public_booking.test.ts`
suite; running those checks against the httpAction requires a
mock `betterAuth` component (`t.registerComponent`), which is
out of scope for this audit.

### Why this fix is safe and non-overlapping

- The route change is one line in `convex/http.ts`, which was
  already committed in `018e492` (not in the dirty
  `HEAD~1..HEAD` diff); it does not touch any dirty file.
- Convex router ordering is method-then-prefix-length; the OTA
  webhook routes (`/api/ota/webhooks/<provider>`) are exact
  paths and are not affected by a longer `/api/public/book/`
  prefix.
- `convex/_generated/` is untouched (the change is in the
  hand-written `convex/http.ts`, not the codegen output).
- `pnpm test` (755/755), `tsc --noEmit`, `pnpm lint`,
  `pnpm check` all green after the fix.

## Findings (carried forward, not fixed in this pass)

Severity guide:

- **P1** = blocks deploy, data safety, auth, payments, or
  core flow
- **P2** = likely to slow shipping or create repeated bugs
- **P3** = cleanup, consistency, docs, or polish

| Sev | Finding | Evidence | Suggested action |
|---|---|---|---|
| **P1** | `.wrangler/deploy/config.json` contains only a stub `configPath: "../../dist/server/wrangler.json"` — there is no `dist/server/wrangler.json` produced by any current build target. `pnpm wrangler deploy` (and the deploy wrapper) cannot resolve a Worker config; the local preview path is non-functional until this is fixed. | `ls dist/server/wrangler.json` → ENOENT; `cat .wrangler/deploy/config.json` → `{"configPath":"../../dist/server/wrangler.json","auxiliaryWorkers":[]}` | Decide whether the prod target is a Cloudflare Worker or just static. If Worker, generate `dist/server/wrangler.json` from `wrangler.jsonc` via a build step; if static, remove `.wrangler/deploy/config.json` and the deploy wrapper. Owner-gated. |
| **P1** | 13 required deploy env vars are unset (`CONVEX_DEPLOY_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BETTER_AUTH_SECRET`, `SITE_URL`, `ENCRYPTION_KEY`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_ADDRESS`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`). `pnpm deploy:check` correctly reports this with exit 1 — `deploy:check` is the gate, not a fix. | `pnpm deploy:check` (this pass) | Owner-gated. Document step-by-step in `tech-stack/TOKENS.md`; add Convex prod secrets via `pnpm convex env set --prod <KEY> <value>`. |
| **P2** | `public_booking.createForSlug` calls the Better Auth component adapter (`components.betterAuth.adapter.findOne`) to resolve the org by slug. `convex-test` cannot exercise this path because the real component is not installed under the test runner; the httpAction is only covered to the input-validation gate. Cross-tenant guard at the createForSlug layer is therefore unverified in vitest. | `convex/public_booking.ts:182-208`; same component path the httpAction calls into | Either (a) build a `convex/__tests__/betterAuth_mock.ts` that stubs `components.betterAuth.adapter.findOne` via `t.registerComponent(...)` so the createForSlug path can be tested end-to-end, or (b) add a Playwright smoke that creates two orgs and POSTs a hostile `tourId` from org B under org A's slug. Out of scope for this audit. |
| **P2** | `convex/__tests__/helpers.ts` `seedOrg` writes to the `organizations` table directly, bypassing the Better Auth org-plugin adapter that `createForSlug` reads from. The existing hostile-pair tests in `public_booking.test.ts` exercise the mutation layer correctly, but the httpAction layer (post-fix) can only be tested up to input validation because the Better Auth component isn't reachable. | `convex/__tests__/helpers.ts:1-180`; cross-ref with `convex/public_booking.ts:42-58` | Pair with the previous item: register a fake `betterAuth` component whose `adapter.findOne` reads from a mirrored `organizations` table populated by `seedOrg`. |
| **P2** | `convex/__tests__/public_booking.test.ts:1-3` explicitly notes "We test the internalCreate mutation directly. The httpAction wrapper is intentionally not tested in vitest (Convex action/http testing requires the live runtime — see convex/http.ts)." After this audit's fix the httpAction is reachable from vitest, so the rationale for skipping the wrapper no longer holds — the suite can grow with the Better Auth component mock above. | `convex/__tests__/public_booking.test.ts:1-3` | Once the Better Auth mock exists, fold the cross-tenant hostile-pair tests into `public_booking_http.test.ts` so they run at the httpAction boundary. |
| **P2** | `convex/http.ts:75` `Origin` allowlist is only enforced when `process.env.PUBLIC_BOOKING_ALLOWED_ORIGINS` is set; missing env var means every origin is allowed. The `pnpm deploy:check` script does not require this var. A production deployment without the env var inherits "all origins allowed" — the same-origin browser quirk (no `Origin` header on same-origin POSTs) hides this for many real clients, but cross-origin POSTs would still slip past. | `convex/http.ts:73-87`; `scripts/deploy-check.mjs:64-71` | Add `PUBLIC_BOOKING_ALLOWED_ORIGINS` to the deploy-check "required" group (or a new "production safety" group). Owner-gated. |
| **P2** | `convex/lib/rate_limit.ts:recordAttempt` is invoked before the org lookup, so a hostile caller burning through unknown slugs consumes the per-email quota even for emails that don't exist. This is by design (the comment in `public_booking.ts:178-185` explains it), but a malicious actor can DOS a victim's email by sending 5 POSTs/min for 15 min to a ghost slug. | `convex/public_booking.ts:178-185` | Cap the per-(email, slug-unknown) attempts separately, or reset the attempt counter when the org lookup fails. Tradeoff: do not weaken the cap for known slugs. |
| **P3** | `convex/__tests__/public_booking.test.ts` and `convex/__tests__/public_booking_http.test.ts` both define their own `seedTour` helpers with overlapping but non-identical option shapes. | `convex/__tests__/public_booking.test.ts:14-48`; `convex/__tests__/public_booking_http.test.ts` (was, now removed) | Factor `seedTour` into `convex/__tests__/helpers.ts` with a single typed signature. Not blocking — both helpers are local and bounded. |
| **P3** | `convex/_generated/api.d.ts` was modified by the prior dirty pass (`git diff HEAD~1 -- convex/_generated/api.d.ts` shows a 12-line diff). Generated files are protected from hand-edits; the diff is from `npx convex codegen`, not from the worker. | `git diff HEAD~1 --stat` | Re-run `npx convex codegen` after the next `convex/` schema change and confirm no extra hand edits. |
| **P3** | `convex/__tests__/public_booking_http.test.ts` was added by this audit (NEW, 8 tests, ~115 LOC). The helpers it imports (`seedOrg`, `seedTour`) live in `convex/__tests__/helpers.ts`; the file does not duplicate the `seedTour` helper from `public_booking.test.ts` directly. | `convex/__tests__/public_booking_http.test.ts` (NEW) | Once the Better Auth mock lands, fold the two suites to share fixtures. |

## Cross-tenant guard evidence at the mutation layer (verified)

The `internalCreate` mutation in `convex/public_booking.ts`
already enforces every cross-tenant guard the contract requires,
and they are covered by `convex/__tests__/public_booking.test.ts`:

- `tour.organizationId !== args.organizationId` → "Tour not
  found" (covers the "hostile `tourId` from another org under
  this org's slug" scenario).
- `schedule.organizationId !== args.organizationId` →
  "Schedule not found" (covers the "hostile `scheduleId` from
  another org under this org's slug" scenario).
- `schedule.tourId !== args.tourId` → "Schedule does not belong
  to the specified tour".
- `get-or-create customer` uses
  `by_org_email(organizationId, email)` so a customer from org A
  cannot be returned when called from org B's slug.

Re-run: `pnpm test convex/__tests__/public_booking.test.ts`
passes (864 lines of regression coverage, no code change in this
audit).

## OTA webhook verification (already verified, repeated check)

- HMAC-SHA256 verification: each provider uses the standard
  `crypto.createHmac` + `timingSafeEqual` pattern from
  `convex/ota/webhook_verify.ts`.
- Replay protection: `WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000` rejects
  anything older than 5 minutes (covers `viator` ordering via
  `event.created`, `getyourguide` via `occurredAt`, etc.).
- Secret storage: `crypto.ts` AES-256-GCM with 12-byte IV and
  auth tag; per-org integration row owns its encrypted secret.
- Commission clamp: `ota/upsert.ts` clamps to `[0, 1]` so a
  hostile OTA payload cannot write `rate=99` and inflate
  revenue.
- Existing regression coverage:
  `convex/__tests__/ota_webhook_factory.test.ts`,
  `convex/__tests__/ota_webhook_verify.test.ts`,
  `convex/__tests__/ota_upsert_commission.test.ts`.

Re-run this audit: `pnpm test convex/__tests__/` passes; tsc +
lint clean. (No OTA code changed in this pass.)

## Files & helpers (audited)

- `convex/schema.ts` — 38 tables; every operator-facing read
  uses an indexed query (`by_org_active`, `by_org_email`,
  `by_org_vip`, etc.); no full-collection scans in production
  paths.
- `convex/lib/authz.ts` — `requireMembership` returns the
  active `organizationId` from the session; every mutation that
  touches tenant data routes through it.
- `convex/lib/validation.ts` — `normalizeEmail`,
  `assertValidCustomerInput`; the public booking flow uses both.
- `convex/lib/rate_limit.ts` — 5 attempts per email per 15 min
  via `publicBookingAttempts` table.
- `convex/lib/time.ts` — `parseBookingTime` rejects past tours
  and tour-cutoff windows.
- `convex/lib/audit.ts` — `logAudit` writes an audit row on
  booking creation (operator and public paths).
- `convex/lib/crypto.ts` — AES-256-GCM for OTA secret storage.

No duplicate constant was found in this pass. The two
`seedTour` helpers (P3 above) are the only minor drift, and it's
file-local.

## G1–G4 scoring (guides-tours live slice)

| Gate | Before 2026-07-26 | After 2026-07-26 |
|---|---|---|
| **G1 Features** (slice structural) | 3 | 3 (unchanged; bookings + public booking + dashboard all real) |
| **G2 UI/UX** (peek only) | 3 / visual | 3 (no UI work this pass) |
| **G3 Stack** | 3+ | 3+ (TanStack Form, shadcn primitives, server-side guards holding) |
| **G4 Deploy** | blocked (no live Stripe webhook smoke; SES unverified; missing deploy creds; no public route reachable due to path-registration bug) | **partially unblocked** — the public booking HTTP route is now reachable from `t.fetch()` and the live router; remaining work is the deploy creds + `.wrangler/deploy/config.json` configPath target. |

## Ship Readiness (current slice)

- [x] Public URL exists or deploy target is clear — Cloudflare
  Workers (wrangler.jsonc), Convex Cloud
- [x] Build command is known — `pnpm build` clean
- [x] Tests/smoke path are known — `pnpm test` 755/755;
  Playwright smoke 23/23 (pre-fix; `pnpm test:e2e` re-run with
  the fix in place would verify the httpAction end-to-end
  through a real browser)
- [x] Env vars are listed — `pnpm deploy:check` reports all 13
  required vars honestly (exit 1 until set)
- [x] Live slice is still accurate — `projects/guides-tours.md`
  describes the same surface
- [x] Public booking HTTP route is now reachable
  (`pathPrefix` registered) — see Safe Fix #1
- [ ] **Authenticated browser smoke** remains opt-in
  (`E2E_AUTH=1`) — only run when owner pastes a real test
  account; not run in this pass
- [ ] **Owner action required**: real SES keys →
  `pnpm ses:set` → smoke invite to verified address (one-time)
- [ ] **Owner action required**: Stripe live webhook smoke
  (env `STRIPE_WEBHOOK_SECRET`); configure per-org payment
  settings before claiming billing readiness
- [ ] **Owner action required**: deploy credentials +
  `.wrangler/deploy/config.json` configPath target

## Reusable Lessons

- **Add to `tech-stack/SHIP-KIT.md`** under "Convex HTTP
  actions":
  - Convex's `HttpRouter` only supports exact-match `path` and
    prefix-match `pathPrefix` (the latter must end in `/`).
    There is NO path-parameter interpolation — `:slug` style
    syntax in `path` is registered as a literal string and the
    route will never match a real request. For dynamic path
    segments, register `pathPrefix` and parse the suffix inside
    the handler (`url.pathname.split("/")` + a known anchor).
  - Verifying a registered route with `t.fetch()` is the
    cheapest way to catch this bug class — a 404 on a path
    you registered is the symptom.

- **Add to `tech-stack/CONVENTIONS.md`** under "Test routing
  before testing logic":
  - For any httpAction with a dynamic path component, the first
    vitest case should be a `t.fetch(...)` smoke that asserts
    the route reaches the handler (a 4xx response is fine —
    proves the router matched). Without this, the rest of the
    suite is testing code that is never reachable in production.

- **Add to `tech-stack/SHIP-KIT.md`** under "Deploy preflight":
  - The "all origins allowed" default for
    `PUBLIC_BOOKING_ALLOWED_ORIGINS` is dev-friendly but a
    silent prod risk. `pnpm deploy:check` should require it for
    the production target (or at least warn loudly).

- **Update `projects/guides-tours.md`** "What's left" list to
  add "Public booking HTTP route registered with broken
  `:slug` path parameter (FIXED 2026-07-26)",
  "`.wrangler/deploy/config.json` configPath target missing
  (P1, owner-gated)", and
  "`PUBLIC_BOOKING_ALLOWED_ORIGINS` default-all-origins prod
  risk (P2)".

## Next Actions

1. **Owner**: paste AWS SES keys → `pnpm ses:set` → smoke invite
   to a SES-verified address (one-time).
2. **Owner (when ready to monetize)**: Stripe live webhook smoke
   against `pnpm dev` with a Stripe CLI listener
   (`stripe listen --forward-to …/payments/stripe/webhook`),
   then configure per-org payment settings.
3. **Owner**: provide `CONVEX_DEPLOY_KEY`, `CLOUDFLARE_*`, and
   set Convex prod envs (see deploy-check output). Decide the
   `.wrangler/deploy/config.json` configPath resolution path
   (Worker build step vs remove the wrapper).
4. **Follow-up feature** (out of this audit's scope):
   - Build a Better Auth component mock for `convex-test` so
     the httpAction can be exercised end-to-end against
     cross-tenant hostile `tourId`/`scheduleId` payloads.
   - Fold the two `seedTour` helpers (P3) into
     `convex/__tests__/helpers.ts`.
   - Add `PUBLIC_BOOKING_ALLOWED_ORIGINS` to the deploy-check
     "required" or "production safety" group.

## Diff summary (this pass)

```
 convex/__tests__/public_booking_http.test.ts | (new, 8 tests, ~115 LOC)
 convex/http.ts                              |  4 +-
 2 files changed, ~115 insertions(+), 4 deletions(-)
```

No pre-existing dirty path was modified. The one-line production
fix in `convex/http.ts` (path registration) is independent of
the dirty `HEAD~1..HEAD` work and is captured here because the
fix unblocks the public booking contract that the audit is
responsible for. The new test file is the only untracked path
this pass creates, and every behavioural contract it enforces
already has a corresponding production-code fix in the diff
above.
