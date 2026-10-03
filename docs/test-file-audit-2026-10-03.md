# Test-file audit — guides-tours — 2026-10-03

Scope: all ~99 `*.test.*` files (71 `convex/__tests__` backend + 15
`src/__tests__` + `convex/lib`, `convex/ota`, `convex/notifications`,
`src/lib`). Fleet test-file audit 4/8.
Baseline: `pnpm vitest run` → 100 files / 1143 tests green on main
`c65bba4`, ~6.5s wall.

## Verdict: strong suite; one real slop file found and fixed in-place

The convex/__tests__ bulk is the fleet's deepest backend coverage —
idempotency, authz boundaries, state-machine guards, refund backfills.
Client tests are incident-cited (F64 form validation, hydration-fork pins
in `public-booking-link-bar`, the booking-hero bigint boundary).

### The one genuine slop finding — `analytics-presets.test.ts`

The file **re-implemented `lastNDays`/`yearToDate`/`isoDate` inside the
test file** and never imported the production code. Worse, the copies
took a `now` parameter the real `src/lib/date-range.ts` functions don't
have — so the suite could not fail even if production reverted to the
frozen module-level PRESETS bug it claimed to guard. And `yearToDate`
itself was page-local in `analytics.tsx`, unimportable.

Fix shipped on this branch: `yearToDate` extracted to
`src/lib/date-range.ts` (page now imports it), the test file rewritten to
call the real exports under `vi.setSystemTime`, and `upcomingDateRange`
covered. 7/7 green.

Doctrine: **a test that re-defines the function it claims to test is
worse than no test** — it reports green through any production drift.
Same class as fuddy's zero-caller `ses.test.ts` shim.

### Marginal keeps (not worth churning)

- `status-styles.test.ts` — pins the status→badge-variant map + coverage
  + unknown→outline. Variant pins are visual, but status→severity is a
  semantic contract in ops UIs. Keep.
- `skeleton.test.tsx` — pins `animate-pulse`/`data-slot` on the shadcn
  primitive. Weak, but removing the pulse would be a silent UX
  regression. Keep, merge-on-touch if it grows.
- `ota-providers.test.ts` — the 7-provider roster pin is a *supported
  integrations* contract, not copy churn; fallback behavior is real.
  Keep.

### Everything else

All other files sampled are seam tests or incident-cited locks —
validation regexes, invite expiry/resend state machines, clipboard/SSR
boundaries, money formatting with the Convex `int64`→bigint boundary
explicitly exercised.

## Actions taken

- `analytics-presets.test.ts` rewritten against production exports.
- `yearToDate` moved `analytics.tsx` → `src/lib/date-range.ts`.
- No deletions — nothing else qualified.
