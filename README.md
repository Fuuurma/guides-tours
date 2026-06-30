# guides-tours

Tour operator SaaS — TanStack Start + Convex + Better Auth + Stripe + SES.

## Status

- **Stage:** ready to deploy
- **Backend:** 38 Convex tables (35 app + 3 org-plugin), 100+ functions, 51 test files, **579 passing tests**
- **Frontend:** 47 routes, full dashboard + public booking + onboarding + invite flows
- **Auth:** Better Auth local-install — sign-up → onboarding → dashboard passes end-to-end
- **Stack migrations:** all done (no remaining source codebases)
- **Awaiting:** production env vars + `npx convex deploy --prod` + `pnpm wrangler deploy`
- **Migration plan:** [`newProjectsPlanner/migrations/2026-06-deployment-and-convergence.md`](../../newProjectsPlanner/migrations/2026-06-deployment-and-convergence.md)
- **Deploy guide:** [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Edge-runtime notes:** [docs/EDGE-RUNTIME.md](./docs/EDGE-RUNTIME.md) (why we use custom SigV4 + raw fetch for AWS/Stripe)
- **Data layer status:** [docs/DATA_LAYER_STATUS.md](./docs/DATA_LAYER_STATUS.md) (which backend modules are FE-wired vs. data-layer only)

## Stack (standard, per CONVENTIONS.md)

- **Frontend:** TanStack Start (React 19, file-based routing, Vite 8) → Cloudflare Workers
- **Backend:** Convex (DB, auth, realtime, cron, storage, vector search)
- **Auth:** Better Auth via `@convex-dev/better-auth` (org plugin + multi-tenancy)
- **Styling:** Tailwind v4 + shadcn/ui (radix, new-york style)
- **Email:** AWS SES via Web Crypto Signature V4 (works in Cloudflare + Convex default runtime — no `"use node"` directive needed). See `convex/lib/awsSigV4.ts`.
- **Payments:** Stripe via raw `fetch` (no SDK — same edge-runtime rationale)
- **Package manager:** pnpm 10.30.2
- **Testing:** Vitest (579 tests) + Playwright smoke (23/23 e2e: 19 route smoke + 4 auth flows)

## First-time setup

```bash
# 1. Install
pnpm install

# 2. Copy env template
cp .env.example .env.local

# 3. Provision Convex deployment (writes VITE_CONVEX_URL etc. into .env.local)
npx convex dev

# 4. Set secrets on Convex dashboard
npx convex env set BETTER_AUTH_SECRET=$(openssl rand -base64 32)
npx convex env set SITE_URL=http://localhost:3000

# 5. Start the app
pnpm dev                    # frontend on :3000 (separate terminal for backend)
```

## Scripts

- `pnpm dev` — Vite dev server (port 3000)
- `pnpm build` — Production build (Cloudflare Workers target)
- `pnpm deploy` — Build + `wrangler deploy`
- `pnpm test` — Vitest run (579 tests)
- `pnpm test:e2e` — Playwright smoke (23 tests; requires `pnpm dev` running)
- `pnpm lint` — Biome lint
- `pnpm check` — Biome lint + format check
- `npx convex dev` — Convex backend dev (separate terminal)
- `npx convex deploy --prod` — Convex production deploy
- `npx tsr generate` — Regenerate route tree (run after adding routes)

## Repository layout

```
convex/                          # Backend (Convex)
├── auth.ts                      # Better Auth factory
├── schema.ts                    # 35 app tables (tours, bookings, customers, OTA, …)
├── betterAuth/                  # Local-install Better Auth component
│   ├── schema.ts                #   Component schema (imports generatedSchema)
│   ├── generatedSchema.ts       #   Auto-generated tables (user, session, org, member, invitation, …)
│   └── _generated/              #   Convex auto-generated component API types
├── http.ts                      # HTTP route registration (auth, OTA webhooks, public booking)
├── lib/
│   ├── authz.ts                 # requireMembership / requireRole
│   ├── crypto.ts                # AES-256-GCM for OTA secrets at rest
│   ├── awsSigV4.ts              # SES SigV4 (Web Crypto, no node deps)
│   ├── rate_limit.ts            # Public booking rate limit (5/email/15min)
│   ├── time.ts                  # parseBookingTime helper
│   └── __tests__/helpers.ts     # Shared seed functions
├── __tests__/                   # 51 test files, 575 tests
├── notification_dispatch.ts     # Email/SMS dispatch (incl. immediate confirmation)
├── bookings.ts                  # CRUD + state machine (pending → confirmed → checked_in → completed/cancelled)
├── public_booking.ts            # POST /api/public/book/:slug + slug resolver
├── ota/                         # 7 OTA providers (Viator, GetYourGuide, Airbnb, TripAdvisor, Klook, Booking.com, Expedia)
│   ├── router.ts                # Webhook URL registration
│   ├── webhook_verify.ts        # HMAC + timestamp replay protection
│   └── <provider>_webhook.ts    # Per-provider handler
└── …

src/
├── components/
│   ├── ui/                      # shadcn primitives (radix-based)
│   ├── list-page.tsx            # Shared list shell
│   ├── detail-page.tsx          # Shared detail shell
│   ├── status-badge.tsx         # StatusBadge (single source of truth)
│   ├── status-styles.ts         # statusStyles map (single source of truth)
│   ├── entity-form.tsx          # useEntityForm + EntityFormPage shell
│   ├── metric-card.tsx          # MetricCard + DetailRow
│   ├── nav-bar.tsx              # 15-item horizontal nav
│   └── pages/                   # Page-level components (new-X, edit-X, customer-detail, etc.)
├── routes/                       # TanStack Router file-based routes
│   ├── __root.tsx               # Root layout
│   ├── dashboard.tsx            # Authenticated layout
│   ├── dashboard/
│   │   ├── index.tsx            # Home dashboard
│   │   ├── analytics.tsx        # KPIs + top tours + bookings-by-source
│   │   ├── bookings/            # list + new + detail + edit
│   │   ├── tours/               # list + new + detail + edit
│   │   ├── templates/, schedules/, assignments/, customers/
│   │   ├── vehicles/, drivers/, vacations/, notifications/, ota/
│   │   ├── categories/          # NEW: tour categories (Phase 4 backend, now with UI)
│   │   └── settings/payments.tsx
│   ├── book/$slug.tsx           # Public booking page (no auth)
│   ├── invite/$invitationId.tsx
│   ├── sign-in.tsx, sign-up.tsx, onboarding.tsx
└── e2e/                         # Playwright smoke
```

wrangler.jsonc                   # Cloudflare Workers config
vite.config.ts                   # SSR + Convex dev plugin
vitest.config.ts                 # Isolated from vite.config.ts (node env, no Cloudflare)
playwright.config.ts             # Smoke config
biome.json                       # Lint + format
.env.example                     # Env template
```

## Domain features

- **Tours** — CRUD, soft-delete, languages, inclusions/exclusions/highlights, base price (cents), tour type, capacity, min/max guests, bookingCutoffHours, active toggle
- **Templates** — Reusable tour defaults; one-click clone to new tour
- **Categories** — Group tours on the public booking page; icon + color + displayOrder
- **Schedules** — Concrete tour instances with capacity tracking; `incrementBooked` on booking, `decrementBooked` on cancel
- **Bookings** — Customer get-or-create, state machine, immediate confirmation email, audit log, OTA source tracking
- **Public booking** — No-auth flow at `/book/:slug`, rate-limited (5/email/15min), origin allowlist
- **Customers** — CRM, VIP tiers, loyalty points, tags, source tracking
- **Assignments** — Guide/vehicle/driver scheduling, conflict detection
- **Vacations** — Staff time-off requests, approval workflow
- **Notifications** — Templates (10 types), settings (Twilio/SES/WhatsApp), scheduled reminders (24h/2h), immediate booking confirmations
- **OTA** — 7 providers with webhook normalization, HMAC + timestamp verification, idempotent upserts
- **Payments** — Stripe PaymentIntent flow + webhook + settings UI
- **Files** — Convex storage + metadata table for tour images (data layer ready, no UI yet — see [docs/DATA_LAYER_STATUS.md](./docs/DATA_LAYER_STATUS.md))
- **Tour images** — Per-tour image gallery (data layer ready, no UI yet)
- **Tour analytics** — Aggregated tour stats table for 90d+ trend reports
- **Tour exception dates** — Per-tour date overrides (closure calendar)
- **Tour seasonal schedules** — Recurring weekly schedule generator
- **Blackout dates** — Per-tour closure windows (public query `isBlackout` available)

## Security

- Multi-tenancy via Better Auth org plugin (every public mutation checks `requireRole` or `requireMembership`)
- Org-scoped query helpers (5 critical IDOR fixes + 4 high-severity state-machine guards)
- OTA webhook HMAC + 5-minute timestamp window (replay protection)
- Public booking rate limit + origin allowlist
- AES-256-GCM encryption for OTA secrets at rest
- Stripe webhook orgId validation (cross-tenant payment writes blocked)

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full env var list and deploy steps.

```bash
# Backend
npx convex deploy --prod

# Frontend
pnpm build && pnpm wrangler deploy

# Smoke
PLAYWRIGHT_BASE_URL=https://guides-tours.fuurma.tech pnpm test:e2e
```
