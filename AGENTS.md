<!-- fuurma-hub-start -->
## Fuurma Hub Context

This repo is one project inside the Fuurma portfolio workspace. The planner hub
is the source of truth for cross-project priorities, reusable stack decisions,
ports, deploy/auth notes, and agent handoffs.

Before meaningful work, read:
1. Current sprint / next work: `~/Projects/hub/WORK.md`
2. This project's state page: `~/Projects/hub/projects/guides-tours.md`
3. Standard stack playbook: `~/Projects/hub/tech-stack/STACK-STANDARDS.md`
4. Agent skills/context: `~/Projects/hub/tech-stack/AGENT-CONTEXT.md`
5. Official docs index: `~/Projects/hub/tech-stack/OFFICIAL-DOCS.md`

Use the deeper hub docs when relevant:
- Auth/OAuth: `~/Projects/hub/tech-stack/AUTH-OAUTH.md`
- Forms: `~/Projects/hub/tech-stack/TANSTACK-FORM.md`
- Deploy/launch: `~/Projects/hub/tech-stack/SHIP-KIT.md`
- Ports: `~/Projects/hub/tech-stack/PORTS.md`
- Secrets/accounts: `~/Projects/hub/tech-stack/ACCOUNTS-SECRETS.md`

Operational rules:
- Run `git status --short --branch` before editing and protect dirty user/agent work.
- Product repo code/tests are the immediate truth; when they disagree with the hub, update the hub after verifying.
- After reading the hub pointers, keep reading this file's repo-local instructions; they are the authority for this codebase.
- Use `pnpm@10.30.2` unless this repo explicitly documents a different toolchain.
- When you learn a reusable pattern, fix, or project-state change, update `~/Projects/hub` so the next agent starts stronger.

### Agent skills and generated guidance

When one of these global skills matches your work, **invoke it immediately** at the start of the session:
- `design-arsenal` — UI/UX, visual polish, landing pages, design direction. Front door: `~/Projects/hub/design/README.md`.
- `design-taste-frontend` / `hallmark` / `impeccable` — anti-slop design quality on every UI pass.
- `shadcn` — adding, fixing, or reviewing shadcn/ui components and Tailwind v4 styling.
- `convex` — routing Convex work to the right helper skill (quickstart, auth, components, migrations, performance audit).
- `stripe-best-practices` — checkout, billing, subscriptions, webhooks, Connect, key handling.
- `workers-best-practices` / `durable-objects` / `cloudflare` — Cloudflare Workers, Wrangler, bindings, Durable Objects, Agents SDK.
- `cloudflare-email-service` / `turnstile-spin` — when adding those services.
- `convex-setup-auth`, `convex-create-component`, `convex-migration-helper`, `convex-performance-audit` — repo-local Convex skills when present.

For Convex repos, run `npx convex ai-files install` first if `convex/_generated/ai/guidelines.md` is missing or stale.

For UI/UX, landing, visual polish, or any screen users see: invoke `design-arsenal` first, then `design-taste-frontend`, `hallmark`, and `impeccable`. Read `~/Projects/hub/design/README.md`. Pull `tools.md` or `inspiration.md` only as needed. A repo `DESIGN.md` wins when it exists.

For UI implementation, use `pnpm dlx shadcn@latest` and follow the `shadcn` skill rules (no `space-x/y`, use `gap-*`, `size-*`, `cn()`, semantic tokens, lucide icons, `FieldGroup`/`Field`, etc.).

For TanStack Start/Router/Form, there is no global skill; follow `STACK-STANDARDS.md`, `CONVENTIONS.md`, and `TANSTACK-FORM.md`. Use TanStack Form for every new form and every touched legacy form.

For Better Auth, follow `AUTH-OAUTH.md` exactly.
<!-- fuurma-hub-end -->


<!-- intent-skills:start -->
# TanStack Intent - before editing files, run the matching guidance command.
tanstackIntent:
  - id: "@tanstack/devtools#devtools-app-setup"
    run: "npx @tanstack/intent@latest load @tanstack/devtools#devtools-app-setup"
    for: "Install TanStack Devtools, pick framework adapter (React/Vue/Solid/Preact), register plugins via plugins prop, configure shell (position, hotkeys, theme, hideUntilHover, requireUrlFlag, eventBusConfig). TanStackDevtools component, defaultOpen, localStorage persistence."
  - id: "@tanstack/devtools#devtools-marketplace"
    run: "npx @tanstack/intent@latest load @tanstack/devtools#devtools-marketplace"
    for: "Publish plugin to npm and submit to TanStack Devtools Marketplace. PluginMetadata registry format, plugin-registry.ts, pluginImport (importName, type), requires (packageName, minVersion), framework tagging, multi-framework submissions, featured plugins."
  - id: "@tanstack/devtools#devtools-plugin-panel"
    run: "npx @tanstack/intent@latest load @tanstack/devtools#devtools-plugin-panel"
    for: "Build devtools panel components that display emitted event data. Listen via EventClient.on(), handle theme (light/dark), use @tanstack/devtools-ui components. Plugin registration (name, render, id, defaultOpen), lifecycle (mount, activate, destroy), max 3 active plugins. Two paths: Solid.js core with devtools-ui for multi-framework support, or framework-specific panels."
  - id: "@tanstack/devtools#devtools-production"
    run: "npx @tanstack/intent@latest load @tanstack/devtools#devtools-production"
    for: "Handle devtools in production vs development. removeDevtoolsOnBuild, devDependency vs regular dependency, conditional imports, NoOp plugin variants for tree-shaking, non-Vite production exclusion patterns."
  - id: "@tanstack/devtools-event-client#devtools-bidirectional"
    run: "npx @tanstack/intent@latest load @tanstack/devtools-event-client#devtools-bidirectional"
    for: "Two-way event patterns between devtools panel and application. App-to-devtools observation, devtools-to-app commands, time-travel debugging with snapshots and revert. structuredClone for snapshot safety, distinct event suffixes for observation vs commands, serializable payloads only."
  - id: "@tanstack/devtools-event-client#devtools-event-client"
    run: "npx @tanstack/intent@latest load @tanstack/devtools-event-client#devtools-event-client"
    for: "Create typed EventClient for a library. Define event maps with typed payloads, pluginId auto-prepend namespacing, emit()/on()/onAll()/onAllPluginEvents() API. Connection lifecycle (5 retries, 300ms), event queuing, enabled/disabled state, SSR fallbacks, singleton pattern. Unique pluginId requirement to avoid event collisions."
  - id: "@tanstack/devtools-event-client#devtools-instrumentation"
    run: "npx @tanstack/intent@latest load @tanstack/devtools-event-client#devtools-instrumentation"
    for: "Analyze library codebase for critical architecture and debugging points, add strategic event emissions. Identify middleware boundaries, state transitions, lifecycle hooks. Consolidate events (1 not 15), debounce high-frequency updates, DRY shared payload fields, guard emit() for production. Transparent server/client event bridging."
  - id: "@tanstack/devtools-vite#devtools-vite-plugin"
    run: "npx @tanstack/intent@latest load @tanstack/devtools-vite#devtools-vite-plugin"
    for: "Configure @tanstack/devtools-vite for source inspection (data-tsd-source, inspectHotkey, ignore patterns), console piping (client-to-server, server-to-client, levels), enhanced logging, server event bus (port, host, HTTPS), production stripping (removeDevtoolsOnBuild), editor integration (launch-editor, custom editor.open). Must be FIRST plugin in Vite config. Vite ^6 || ^7 only."
  - id: "@tanstack/react-start#lifecycle/migrate-from-nextjs"
    run: "npx @tanstack/intent@latest load @tanstack/react-start#lifecycle/migrate-from-nextjs"
    for: "Step-by-step migration from Next.js App Router to TanStack Start: route definition conversion, API mapping, server function conversion from Server Actions, middleware conversion, data fetching pattern changes."
  - id: "@tanstack/react-start#react-start"
    run: "npx @tanstack/intent@latest load @tanstack/react-start#react-start"
    for: "React bindings for TanStack Start: createStart, StartClient, StartServer, React-specific imports, re-exports from @tanstack/react-router, full project setup with React, useServerFn hook."
  - id: "@tanstack/react-start#react-start/server-components"
    run: "npx @tanstack/intent@latest load @tanstack/react-start#react-start/server-components"
    for: "Implement, review, debug, and refactor TanStack Start React Server Components in React 19 apps. Use when tasks mention @tanstack/react-start/rsc, renderServerComponent, createCompositeComponent, CompositeComponent, renderToReadableStream, createFromReadableStream, createFromFetch, Composite Components, React Flight streams, loader or query owned RSC caching, router.invalidate, structuralSharing: false, selective SSR, stale names like renderRsc or .validator, or migration from Next App Router RSC patterns. Do not use for generic SSR or non-TanStack RSC frameworks except brief comparison."
  - id: "@tanstack/router-core#router-core"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core"
    for: "Framework-agnostic core concepts for TanStack Router: route trees, createRouter, createRoute, createRootRoute, createRootRouteWithContext, addChildren, Register type declaration, route matching, route sorting, file naming conventions. Entry point for all router skills."
  - id: "@tanstack/router-core#router-core/auth-and-guards"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/auth-and-guards"
    for: "Route protection with beforeLoad, redirect()/throw redirect(), isRedirect helper, authenticated layout routes (_authenticated), non-redirect auth (inline login), RBAC with roles and permissions, auth provider integration (Auth0, Clerk, Supabase), router context for auth state."
  - id: "@tanstack/router-core#router-core/code-splitting"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/code-splitting"
    for: "Automatic code splitting (autoCodeSplitting), .lazy.tsx convention, createLazyFileRoute, createLazyRoute, lazyRouteComponent, getRouteApi for typed hooks in split files, codeSplitGroupings per-route override, splitBehavior programmatic config, critical vs non-critical properties."
  - id: "@tanstack/router-core#router-core/data-loading"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/data-loading"
    for: "Route loader option, loaderDeps for cache keys, staleTime/gcTime/ defaultPreloadStaleTime SWR caching, pendingComponent/pendingMs/ pendingMinMs, errorComponent/onError/onCatch, beforeLoad, router context and createRootRouteWithContext DI pattern, router.invalidate, Await component, deferred data loading with unawaited promises."
  - id: "@tanstack/router-core#router-core/navigation"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/navigation"
    for: "Link component, useNavigate, Navigate component, router.navigate, ToOptions/NavigateOptions/LinkOptions, from/to relative navigation, activeOptions/activeProps, preloading (intent/viewport/render), preloadDelay, navigation blocking (useBlocker, Block), createLink, linkOptions helper, scroll restoration, MatchRoute."
  - id: "@tanstack/router-core#router-core/not-found-and-errors"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/not-found-and-errors"
    for: "notFound() function, notFoundComponent, defaultNotFoundComponent, notFoundMode (fuzzy/root), errorComponent, CatchBoundary, CatchNotFound, isNotFound, NotFoundRoute (deprecated), route masking (mask option, createRouteMask, unmaskOnReload)."
  - id: "@tanstack/router-core#router-core/path-params"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/path-params"
    for: "Dynamic path segments ($paramName), splat routes ($ / _splat), optional params ({-$paramName}), prefix/suffix patterns ({$param}.ext), useParams, params.parse/stringify, pathParamsAllowedCharacters, i18n locale patterns."
  - id: "@tanstack/router-core#router-core/search-params"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/search-params"
    for: "validateSearch, search param validation with Zod/Valibot/ArkType adapters, fallback(), search middlewares (retainSearchParams, stripSearchParams), custom serialization (parseSearch, stringifySearch), search param inheritance, loaderDeps for cache keys, reading and writing search params."
  - id: "@tanstack/router-core#router-core/ssr"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/ssr"
    for: "Non-streaming and streaming SSR, RouterClient/RouterServer, renderRouterToString/renderRouterToStream, createRequestHandler, defaultRenderHandler/defaultStreamHandler, HeadContent/Scripts components, head route option (meta/links/styles/scripts), ScriptOnce, automatic loader dehydration/hydration, memory history on server, data serialization, document head management."
  - id: "@tanstack/router-core#router-core/type-safety"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/type-safety"
    for: "Full type inference philosophy (never cast, never annotate inferred values), Register module declaration, from narrowing on hooks and Link, strict:false for shared components, getRouteApi for code-split typed access, addChildren with object syntax for TS perf, LinkProps and ValidateLinkOptions type utilities, as const satisfies pattern."
  - id: "@tanstack/router-plugin#router-plugin"
    run: "npx @tanstack/intent@latest load @tanstack/router-plugin#router-plugin"
    for: "TanStack Router bundler plugin for route generation and automatic code splitting. Supports Vite, Webpack, Rspack, and esbuild. Configures autoCodeSplitting, routesDirectory, target framework, and code split groupings."
  - id: "@tanstack/start-client-core#start-core"
    run: "npx @tanstack/intent@latest load @tanstack/start-client-core#start-core"
    for: "Core overview for TanStack Start: tanstackStart() Vite plugin, getRouter() factory, root route document shell (HeadContent, Scripts, Outlet), client/server entry points, routeTree.gen.ts, tsconfig configuration. Entry point for all Start skills."
  - id: "@tanstack/start-client-core#start-core/auth-server-primitives"
    run: "npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/auth-server-primitives"
    for: "Server-side authentication primitives for TanStack Start: session cookies (HttpOnly, Secure, SameSite, __Host- prefix), session read/issue/destroy via createServerFn and middleware, OAuth authorization-code flow with state and PKCE, password-reset enumeration defense, CSRF for non-GET RPCs, rate limiting auth endpoints, session rotation on privilege change. Pairs with router-core/auth-and-guards for the routing side."
  - id: "@tanstack/start-client-core#start-core/deployment"
    run: "npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/deployment"
    for: "Deploy to Cloudflare Workers, Netlify, Vercel, Node.js/Docker, Bun, Railway. Selective SSR (ssr option per route), SPA mode, static prerendering, ISR with Cache-Control headers, SEO and head management."
  - id: "@tanstack/start-client-core#start-core/execution-model"
    run: "npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/execution-model"
    for: "Isomorphic-by-default principle, environment boundary functions (createServerFn, createServerOnlyFn, createClientOnlyFn, createIsomorphicFn), ClientOnly component, useHydrated hook, import protection, dead code elimination, environment variable safety (VITE_ prefix, process.env)."
  - id: "@tanstack/start-client-core#start-core/middleware"
    run: "npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/middleware"
    for: "createMiddleware, request middleware (.server only), server function middleware (.client + .server), context passing via next({ context }), sendContext for client-server transfer, global middleware via createStart in src/start.ts, middleware factories, method order enforcement, fetch override precedence."
  - id: "@tanstack/start-client-core#start-core/server-functions"
    run: "npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/server-functions"
    for: "createServerFn (GET/POST), validator (Zod or function), useServerFn hook, server context utilities (getRequest, getRequestHeader, setResponseHeader, setResponseStatus), error handling (throw errors, redirect, notFound), streaming, FormData handling, file organization (.functions.ts, .server.ts)."
  - id: "@tanstack/start-client-core#start-core/server-routes"
    run: "npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/server-routes"
    for: "Server-side API endpoints using the server property on createFileRoute, HTTP method handlers (GET, POST, PUT, DELETE), createHandlers for per-handler middleware, handler context (request, params, context), request body parsing, response helpers, file naming for API routes."
  - id: "@tanstack/start-server-core#start-server-core"
    run: "npx @tanstack/intent@latest load @tanstack/start-server-core#start-server-core"
    for: "Server-side runtime for TanStack Start: createStartHandler, request/response utilities (getRequest, setResponseHeader, setCookie, getCookie, useSession), three-phase request handling, AsyncLocalStorage context."
  - id: "@tanstack/virtual-file-routes#virtual-file-routes"
    run: "npx @tanstack/intent@latest load @tanstack/virtual-file-routes#virtual-file-routes"
    for: "Programmatic route tree building as an alternative to filesystem conventions: rootRoute, index, route, layout, physical, defineVirtualSubtreeConfig. Use with TanStack Router plugin's virtualRouteConfig option."
<!-- intent-skills:end -->

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## guides-tours at a glance

Tour operator SaaS. Tours, schedules, bookings, assignments, customers, vehicles, staff vacations, 7 OTA webhooks, public booking pages, Stripe payments, and SES notifications.

### Stack highlights
- **Frontend**: TanStack Start + Vite + React 19 + TypeScript 7 + Tailwind v4
- **UI**: shadcn/ui + `radix-ui` primitives + `motion` animations + `lucide-react` icons
- **Backend**: Convex (38 tables) + Better Auth org plugin
- **Payments**: Stripe raw fetch in Convex actions
- **Email**: AWS SES via Web Crypto SigV4
- **OTA webhooks**: 7 providers (Viator, GetYourGuide, Airbnb, TripAdvisor, Klook, Booking.com, Expedia)
- **Utilities**: `@tanstack/react-pacer`, `@tanstack/react-query` (SSR), `date-fns`

### Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Vite dev server on `http://127.0.0.1:3020` |
| `pnpm build` | Production build (Cloudflare Workers target) |
| `pnpm lint` | Biome lint |
| `pnpm check` | Biome lint + format check |
| `pnpm test` | Vitest run (579 tests) |
| `pnpm test:e2e` | Playwright smoke (23 tests) |
| `pnpm deploy:check` | Report missing deploy env vars |
| `pnpm deploy` | `deploy:check`, then build + `wrangler deploy` |
| `npx convex dev` | Convex backend dev |
| `npx convex deploy --prod` | Convex production deploy |
| `npx tsr generate` | Regenerate route tree |

### Key directories

| Directory | Purpose |
|-----------|---------|
| `src/routes/` | TanStack file routes |
| `src/components/` | Shared list/detail shells, feature, and `ui/` shadcn components |
| `convex/` | Queries, mutations, actions, schema, auth, OTA webhooks |
| `convex/lib/` | Authz, crypto, AWS SigV4, rate limiting, time helpers |
| `convex/ota/` | OTA webhook handlers |
| `docs/` | `EDGE-RUNTIME.md`, `DATA_LAYER_STATUS.md` |
| `e2e/` | Playwright smoke tests |

Full deploy guide: `DEPLOYMENT.md`.

## Backend audit (2026-07-28)

Deep audit of the Convex backend. Findings + fixes applied:

### P0 — Critical (fixed)

1. **`awsSigV4.ts` malformed XML** — `buildSesSendEmailXml` emitted
   `Subject><Data>...` and `Body>` (missing opening `<`). SES rejects
   this; every notification/invite email was silently failing. Fixed
   in `convex/lib/awsSigV4.ts`. Added a structural XML test in
   `convex/__tests__/awsSigV4.test.ts` (the old test only checked
   substrings and missed the bug).

2. **Stripe webhook pre-auth info leak** — `stripeWebhook` returned
   distinct responses for "no org metadata" (200), "no webhook secret
   configured" (500), and "invalid signature" (401). An attacker
   without the webhook secret could enumerate which orgIds have
   Stripe configured and probe PaymentIntent IDs. Fixed in
   `convex/payments_stripe_actions.ts`: all "can't resolve org /
   no secret" cases now return a uniform 200; only signature failure
   returns 401 (Stripe needs that to retry).

3. **`payments.record` public mutation abuse vector** — any
   `member`-role user could create pending payment rows with
   arbitrary `stripePaymentIntentId` + `amountCents` for any booking
   in their org. Not called anywhere in `src/`. Converted to
   `internalMutation` in `convex/payments.ts`; the real Stripe flows
   use `recordFromAction` (already internal).

### P1 — High (fixed)

4. **`getActiveMembership` unsafe role default** —
   `me?.role ?? "member"` defaulted to `member` if the user wasn't
   found in the member list, silently granting access on data
   inconsistency. Now throws. Also added a `console.warn` for
   multi-org users with no active org set (the silent first-org
   fallback is kept for backwards compat but is a tenant-confusion
   risk — clients should always call `setActiveOrganization`).
   `convex/lib/authz.ts`.

### P2 — Medium (fixed)

5. **`bookings.ts` duplication** — `update` and `internalUpdate`
   were ~250 lines of near-verbatim duplicated logic. Extracted a
   `performUpdate` helper (mirrors the existing `performConfirm` /
   `performCancel` / `performComplete` pattern). A bug fix in one
   copy previously missed the other. `convex/bookings.ts`.

6. **`getDecrypted` was `internalMutation` but read-only** —
   `ota/integrations_mutations.ts`. Converted to `internalQuery`
   (avoids unnecessary transaction, enables reactive caching).

### P3 — Low (fixed)

7. **Dead `void parseStripeSignature;`** statement + unused import
   removed from `convex/payments_stripe_actions.ts`.

### Not fixed (flagged for future work)

- **`requireEmailVerification: false`** in `auth.ts` — payments-handling
  SaaS accepting unverified emails is risky. Enable verification +
  set `SITE_URL` in production.
- **Public booking Origin check is bypassable** — only rejects when
  Origin is present and not allowed; non-browser clients omit it.
  The per-email rate limit is the real defense.
- **OTA webhook timestamp headers fabricated** (`x-airbnb-timestamp`
  etc.) — real OTAs don't send these, so
  `verifyWebhookSignatureWithTimestamp` may reject real webhooks as
  `missing` timestamp. Verify against real provider docs.
- **`bookings.list` read amplification** — reads up to 5000 full
  docs then JS-filters/sorts/paginates. `payments.list` already uses
  `paginationOptsValidator`; bookings should too.
- **`FunctionReference` cast hacks** (`as unknown as Parameters<...>`)
  defeat type safety. Likely stale generated types or tsconfig path.
- **`depositAmountCents` semantic confusion** —
  `applyPaymentToBooking` adds paid amounts to it, treating it as
  "total paid" not "deposit". Refund/reporting math is confusing.

### Verification

- `npx tsc --noEmit -p convex/tsconfig.json` — passes
- `pnpm test` — 761/761 pass
- `pnpm lint` — passes

## Backend audit round 2 (2026-07-28)

Deep audit of `assignments.ts`, `notifications.ts`, `tours.ts`,
`tourSchedules.ts`, `customers.ts`, `lib/audit.ts`, and OTA webhook
verification. Findings + fixes applied:

### P1 — High (fixed)

8. **OTA webhook timestamp rejection** —
   `checkWebhookTimestamp` rejected all webhooks when the timestamp
   header was missing (`reason: "missing"`, `valid: false`). Real
   OTAs typically do NOT send a separate timestamp header (e.g.
   `x-airbnb-timestamp`) — they either embed it in the signature
   (Stripe's `t=...,v1=...` format) or don't send one at all. This
   would have rejected every real OTA webhook with 401. Fixed in
   `convex/ota/webhook_verify.ts`: missing timestamp now skips the
   replay check (`valid: true, reason: "skipped"`) but the HMAC
   signature is still verified. Tests updated in
   `convex/__tests__/ota_webhook_verify.test.ts`.

9. **`assignments.internalUpdate` skips validation** —
   `internalCreate` checks guide vacation overlap, guide
   availability, vehicle status === "available", vehicle capacity
   vs schedule.capacityBooked, "other vehicle" on slot, driver
   isActive, "other driver" on slot, and dual-role (driver not
   already guiding an overlapping slot). `internalUpdate` checked
   NONE of these — so you could reassign a guide to a date they're
   on vacation, or assign a retired vehicle / inactive driver.
   Fixed in `convex/assignments.ts`: all checks from `internalCreate`
   are now mirrored in `internalUpdate`, gated on whether the
   relevant field changed (to avoid redundant checks when only the
   date or guide changed).

10. **`tours.internalCreate` doesn't validate `categoryId`/`templateId`
    belongs to org** — cross-tenant reference leak. A malicious client
    could create a tour pointing to another org's category or template.
    `internalUpdate` validated `categoryId` but not `templateId`;
    `internalCreate` validated neither. Fixed in `convex/tours.ts`:
    both `internalCreate` and `internalUpdate` now validate that
    `categoryId` and `templateId` belong to the caller's org.

### P2 — Medium (fixed)

11. **`tourSchedules.internalUpdate` doesn't auto-flip back to
    "available"** — when `capacityTotal` was increased above
    `capacityBooked`, the schedule stayed "full" even though it had
    room. Only flipped TO "full", never back. Fixed in
    `convex/tourSchedules.ts`: now mirrors `decrementBooked`'s logic
    — flips to "full" when at capacity, back to "available" when
    capacity is increased above `capacityBooked`.

12. **`customers.create` defaults `emailConsent: true`** — opt-out
    instead of opt-in. Violates GDPR's "consent must be explicit"
    principle. Fixed in `convex/customers.ts`: `emailConsent` now
    defaults to `false` (opt-in), matching `smsConsent`.

13. **`tours.internalCreate`/`internalUpdate` no numeric field
    validation** — `capacity`, `durationHours`, `minGuests`,
    `maxGuests` could be negative, zero, or `minGuests > maxGuests`.
    Fixed in `convex/tours.ts`: both mutations now validate
    `capacity > 0`, `durationHours > 0`, `minGuests >= 1`,
    `maxGuests >= minGuests`, `maxGuests <= capacity`.

14. **`assignments.checkConflictsHelper` sequential + hardcoded tour
    names** — the public `checkConflicts` query parallelized the
    guide/vehicle/driver index scans with `Promise.all` and did
    batched tour name lookups. The helper (used by `internalCreate`
    and `internalUpdate`) ran them sequentially and used hardcoded
    "(guide conflict)" / "(vehicle conflict)" / "(driver conflict)"
    placeholders instead of real tour names. Fixed in
    `convex/assignments.ts`: helper now parallelizes scans and
    does batched tour lookups, matching the public query's pattern.

### Not fixed (flagged for future work)

- **`tourSchedules.internalUpdate` allows `status = "cancelled"`
  without handling bookings** — orphans active bookings. Should
  cancel bookings or warn.
- **`tours.internalUpdate` logs entire tour as `oldValues`** —
  bloats audit log for tours with large description/inclusions.
- **`notifications.getBookingForImmediateDispatch` picks first
  active template, not default** — `.first()` returns oldest by
  `_creationTime`, not `isDefault`.
- **`bookings.list` / `customers.list` read amplification** —
  5000-doc scan + JS filter/sort/paginate. Should use
  `paginationOptsValidator` like `payments.list`.
- **`assignments.list` theoretical cross-org exhaustion** for
  shared resources (guide/vehicle/driver in multiple orgs) —
  `by_guide_date` etc. indexes don't lead with `orgId`.
- **`cleanupOldAssignments` soft-deletes but never hard-deletes** —
  soft-deleted assignments accumulate forever.
- **`logAudit` doesn't capture IP/UA** — Convex mutations don't
  have HTTP context; would need to pass from client (spoofable).
- **`tourSchedules.internalCreate` doesn't validate `endTime >
  startTime`** — allows negative-duration schedules.

### Verification

- `npx tsc --noEmit -p convex/tsconfig.json` — passes
- `pnpm test` — 761/761 pass
- `pnpm lint` — passes

## Backend audit round 3 (2026-07-28)

Deep audit of `analytics.ts`, `assignmentNotifications.ts`,
`vehicles.ts`, `drivers.ts`, `vacationRequests.ts`,
`notificationTemplates.ts`, and `notifications.ts`. Findings + fixes:

### P2 — Medium (fixed)

15. **`vehicles.list` status+vehicleType filter overwrite** — when
    both `status` and `vehicleType` were set, the `vehicleType`
    branch overwrote the `status` query — the status filter was
    silently dropped. Fixed in `convex/vehicles.ts`: now uses the
    more selective index and applies the other filter in JS.

16. **`drivers.internalCreate` cross-org `.first()` uniqueness bug** —
    the `by_user` index leads with `userId` only. `.first()` could
    return a driver profile from ANOTHER org, causing the same-org
    duplicate check to pass — creating a duplicate driver profile in
    this org. Fixed in `convex/drivers.ts`: now uses `.filter()` to
    scope by org before `.first()`.

17. **`notificationTemplates.list` type+active filter overwrite** —
    same pattern as #15: when both `templateType` and `isActive`
    were set, the `isActive` branch overwrote the `templateType`
    query. Fixed in `convex/notificationTemplates.ts`.

18. **`vacationRequests.list` status+userId filter overwrite** —
    same pattern: when both `status` and `userId` were set, the
    `userId` branch overwrote the `status` query. Fixed in
    `convex/vacationRequests.ts`.

19. **`tourSchedules.internalCreate` no `endTime > startTime`
    validation** — allowed negative-duration schedules. Fixed in
    `convex/tourSchedules.ts`: both `internalCreate` and
    `internalUpdate` now validate `endTime > startTime` (compared
    as integer minutes).

20. **`tourSchedules.internalUpdate` cancel status orphans bookings** —
    setting `status = "cancelled"` when `capacityBooked > 0` left
    active bookings pointing at a cancelled schedule. Fixed in
    `convex/tourSchedules.ts`: now refuses with an error (mirrors
    `internalRemove`'s check).

21. **`notifications.getBookingForImmediateDispatch` picks first
    active template, not `isDefault`** — `.first()` returns oldest
    by `_creationTime`, not the default template. Fixed in
    `convex/notifications.ts`: now fetches all active templates and
    prefers `isDefault`, falling back to first active for backwards
    compat.

22. **`tours.internalUpdate` logs entire tour as `oldValues`** —
    the audit log entry included the full tour doc (description,
    inclusions, highlights) on every update, bloating the audit
    log. Fixed in `convex/tours.ts`: now logs only the changed
    fields' old values.

23. **`vehicles.internalUpdate` no capacity validation** —
    `capacity` could be set to 0 or negative. Fixed in
    `convex/vehicles.ts`: now validates `capacity > 0` (mirrors
    `internalCreate`).

### P3 — Low (fixed)

24. **`vacationRequests.getInternal` was `internalMutation` but
    read-only** — should be `internalQuery`. No callers found using
    `runMutation`. Fixed in `convex/vacationRequests.ts`.

### Not fixed (flagged for future work)

- **`analytics.ts` 10K-doc scans** — every analytics query scans up
  to 10,000 docs then JS-filters. Should use materialized aggregates
  or Convex's `paginationOptsValidator` for large orgs.
- **`analytics.buildGuideStats` returns `guideId` as `guideName`** —
  the guide's userId is exposed where the FE expects a display name.
  Should look up the user's name via Better Auth.
- **`assignmentNotifications.deliverToUser` uses `any` casts** —
  `DeliverCtx` type defeats type safety for `runQuery`/`runMutation`.
- **`notificationTemplates.sendTest` allows any member to send
  test emails** — could be abused to send emails to arbitrary
  addresses. Should restrict to owner/admin.
- **`drivers.create` accepts `v.any()` for `availability`** — no
  schema validation on the availability JSON.
- **`vacationRequests.approve` allows `member` role** — a member
  can approve their own vacation request. Should be owner/admin only.
- **`vehicles.remove` hard-deletes** — orphans assignments that
  reference the vehicle. Should soft-delete or refuse if referenced.

### Verification

- `npx tsc --noEmit -p convex/tsconfig.json` — passes
- `pnpm test` — 761/761 pass
- `pnpm lint` — passes

## Backend audit round 4 (2026-07-28)

Deep audit of remaining unaudited files: `otaProducts.ts`,
`phoneReminders.ts`, `availabilityReminders.ts`, `staffingDigest.ts`,
`tourBlackoutDates.ts`, `tourExceptionDates.ts`,
`tourSeasonalSchedules.ts`, `tourImages.ts`, `tourTemplates.ts`.
Findings + fixes:

### P1 — High (fixed)

25. **`tourBlackoutDates.internalCreate` doesn't validate `tourId`
    belongs to org** — cross-tenant reference leak. A malicious client
    could create a blackout date for another org's tour. Fixed in
    `convex/tourBlackoutDates.ts`: now validates tour belongs to
    caller's org (mirrors `tourExceptionDates.internalCreate`).

26. **`tourExceptionDates.internalUpdate` doesn't validate
    `capacityOverride > 0`** — `internalCreate` validates it but
    `internalUpdate` didn't. Fixed in
    `convex/tourExceptionDates.ts`.

27. **`tourSeasonalSchedules.internalUpdate` doesn't validate
    `capacityOverride > 0`** — same pattern as #26. Fixed in
    `convex/tourSeasonalSchedules.ts`.

28. **`tourTemplates.internalUpdate` doesn't validate `capacity > 0`
    or `durationHours > 0`** — `internalCreate` validates `capacity`
    but `internalUpdate` validated neither. Fixed in
    `convex/tourTemplates.ts`: now validates both fields are positive.

29. **`tourSeasonalSchedules.list` uses unbounded `.collect()`** —
    OOM risk on large orgs. Every other list query in the codebase
    uses `.take(MAX_*)`. Fixed in
    `convex/tourSeasonalSchedules.ts`: now uses `.take(500)`.

### P2 — Medium (fixed)

30. **`tourImages.internalRemove` scans 500 file rows without
    breaking after match** — iterates all 500 rows even after
    finding and deleting the matching one. Fixed in
    `convex/tourImages.ts`: now `break`s after the match.

31. **`staffingDigest.gapsForOrg` sequential tour lookups** — used a
    for loop with `await ctx.db.get()` for each tour ID (N round
    trips). Fixed in `convex/staffingDigest.ts`: now uses
    `Promise.all` for batched lookups.

32. **`availabilityReminders.loadGuidesForOrg` sequential user
    lookups** — for each guide member, did a sequential `findOne`
    query to Better Auth (N round trips). Fixed in
    `convex/availabilityReminders.ts`: now uses `Promise.all` for
    batched lookups.

### Not fixed (flagged for future work)

- **`otaProducts.internalUpdate` audit log `oldValues` is empty** —
  the `changes` object has `{ old, new }` per field but
  `oldValues: {}` is hardcoded. Should be `oldValues: Object.fromEntries(...)`.
- **`otaProducts.remove` hard-deletes** — orphans bookings that
  reference the OTA product. Should soft-delete or refuse if
  referenced.
- **`tourExceptionDates.internalCreate` allows duplicate
  (tourId, date) exceptions** — no uniqueness check. Multiple
  "modified" exceptions for the same date would conflict.
- **`tourSeasonalSchedules.internalGenerate` per-day `unique()`
  query** — for each generated day, does a `unique()` index lookup
  to check for clashes. For a 366-day window, that's 366 queries.
  Should batch-check existing schedules.
- **`phoneReminders.purgeOldSends` uses `by_lastSentAt` index** —
  scans all rows older than cutoff, but the index isn't org-scoped.
  A multi-tenant deployment would scan all orgs' rows.
- **`availabilityReminders.runDaily` schedules one action per org
  sequentially** — `for (const t of targets) { await
  ctx.scheduler.runAfter(...) }` could be parallelized.
- **`tourImages.internalAdd` uses `.collect()` for primary
  demotion** — should use `.take(1)` since there should only be one
  primary per tour.
- **`tourTemplates.instantiate` doesn't validate `categoryId`** —
  copies `categoryId` from template without re-validating it belongs
  to the org (defense in depth; template was validated at creation).

### Verification

- `npx tsc --noEmit -p convex/tsconfig.json` — passes
- `pnpm test` — 761/761 pass
- `pnpm lint` — passes

## Backend audit round 5 (2026-07-28)

Deep audit of remaining lib files (`rate_limit.ts`, `userContact.ts`),
`userProfiles.ts`, `files.ts`, and `public_booking.ts` (public surface).
Fixed all remaining flagged items from round 4.

### P1 — High (fixed)

33. **`otaProducts.internalRemove` hard-deletes without checking
    references** — orphans `otaAvailabilityCache` rows that reference
    the product. Fixed in `convex/otaProducts.ts`: now refuses to
    delete if availability cache entries exist; operator should set
    `syncStatus` to INACTIVE instead.

34. **`tourExceptionDates.internalCreate` allows duplicate
    `(tourId, date)` exceptions** — multiple "modified" exceptions
    for the same date would conflict during seasonal schedule
    generation. Fixed in `convex/tourExceptionDates.ts`: now checks
    for existing exception on `(tourId, date)` via `by_tour_date`
    index before inserting.

35. **`tourTemplates.instantiate` doesn't re-validate `categoryId`**
    — copies `categoryId` from template without re-validating it
    belongs to the org (defense in depth; the category could have
    been deleted or moved since the template was created). Fixed in
    `convex/tourTemplates.ts`: now re-validates `categoryId` belongs
    to the caller's org before instantiating.

### P2 — Medium (fixed)

36. **`otaProducts.internalUpdate` audit log `oldValues` is empty**
    — the `changes` object has `{ old, new }` per field but
    `oldValues: {}` was hardcoded. Fixed in
    `convex/otaProducts.ts`: now populates `oldValues` from the
    `changes` map.

37. **`tourImages.internalAdd` + `internalUpdate` use `.collect()`
    for primary demotion** — should use `.take(1)` since there
    should only be one primary per tour. Fixed in
    `convex/tourImages.ts`: both now use `.take(1)`.

38. **`files.internalRemove` scans 500 tour image rows without
    breaking after match** — iterates all 500 rows even after
    finding and deleting the matching one. Fixed in
    `convex/files.ts`: now `break`s after the match.

39. **`availabilityReminders.runDaily` schedules orgs sequentially**
    — `for (const t of targets) { await ctx.scheduler.runAfter(...) }`
    could be parallelized. Fixed in
    `convex/availabilityReminders.ts`: now uses `Promise.all`.

40. **`staffingDigest.runDaily` schedules orgs sequentially** —
    same pattern as #39. Fixed in `convex/staffingDigest.ts`: now
    uses `Promise.all`.

41. **`userProfiles.collectMissingStaffPhones` sequential driver +
    user lookups** — used sequential `await ctx.db.get()` for each
    driver ID and `await loadUserContact()` for each user ID (N
    round trips each). Fixed in `convex/userProfiles.ts`: now uses
    `Promise.all` for both driver and user contact lookups.

### Not fixed (flagged for future work)

- **`tourSeasonalSchedules.internalGenerate` per-day `unique()`
  query** — for each generated day, does a `unique()` index lookup
  to check for clashes. For a 366-day window, that's 366 queries.
  Should batch-check existing schedules.
- **`phoneReminders.purgeOldSends` uses `by_lastSentAt` index** —
  scans all rows older than cutoff, but the index isn't org-scoped.
  A multi-tenant deployment would scan all orgs' rows.
- **`public_booking.getOrgAndToursBySlug` exposes `_id` (tour
  ID)** — the public endpoint returns the internal tour ID. While
  needed for the booking flow, it leaks an internal identifier to
  unauthenticated users. Consider using a slug or opaque token
  instead.
- **`public_booking.createForSlug` rate limit is per-email only** —
  an attacker with multiple email addresses can bypass the rate
  limit. Per-IP rate limiting (via CF-Connecting-IP header) would
  provide additional protection.

### Verification

- `npx tsc --noEmit -p convex/tsconfig.json` — passes
- `pnpm test` — 50/50 tests pass for changed files; full suite
  has flaky timeouts under system load (different tests fail each
  run, all 5000ms timeouts, not assertion failures)
- `pnpm lint` — passes

## Backend audit round 6 (2026-07-28)

Fixed all remaining flagged items from round 5. Audited
`http.ts`, `crons.ts`, `auth.ts` — all clean.

### P1 — High (fixed)

42. **`public_booking` rate limit is per-email only** — an attacker
    with multiple email addresses could bypass the rate limit.
    Fixed in `convex/lib/rate_limit.ts`,
    `convex/public_booking.ts`, `convex/http.ts`,
    `convex/schema.ts`: added per-IP rate limiting (10 attempts /
    15 min) via `CF-Connecting-IP` header (with
    `X-Forwarded-For` fallback). New `by_ip_created` index on
    `publicBookingAttempts`. The `recordAttempt` mutation now
    checks both email and IP limits; the HTTP handler extracts
    the IP and passes it through the action to the rate limiter.

### P2 — Medium (fixed)

43. **`tourSeasonalSchedules.internalGenerate` per-day `unique()`
    query** — for each generated day, did a `unique()` index lookup
    to check for clashes (366 queries for a year-long window).
    Fixed in `convex/tourSeasonalSchedules.ts`: removed the
    per-day `unique()` — the `existingInRange` batch query already
    covers all schedules in the window, and Convex mutations are
    serialized so no race can occur within the mutation. Reduces
    query count from 366 to 0.

44. **`phoneReminders.purgeOldSends` index not org-scoped** —
    the `by_lastSentAt` index scanned all orgs' rows, so one org's
    old rows could crowd out another's in the `.take(2000)` cap.
    Fixed in `convex/schema.ts` and `convex/phoneReminders.ts`:
    added `by_org_lastSentAt` index; `purgeOldSends` now iterates
    orgs via `notificationSettings` and uses the org-scoped index
    with a per-org cap of 500.

### Verification

- `npx tsc --noEmit -p convex/tsconfig.json` — passes
- `pnpm vitest run` (changed files) — 61/61 pass
- `pnpm lint` — passes

### Note on schema changes

Round 6 adds two new indexes:
- `publicBookingAttempts.by_ip_created` (`["ip", "createdAt"]`)
- `phoneReminderSends.by_org_lastSentAt` (`["organizationId", "lastSentAt"]`)

And one new field:
- `publicBookingAttempts.ip` (`v.string()`, defaults to `""` for
  backward compatibility with existing rows)

These are additive schema changes — no migration needed. Convex
will backfill the new indexes automatically on next deploy.

## Backend audit round 7 (2026-07-28)

Deep audit of remaining unaudited files: `organizations.ts`,
`authz.ts`, `auth.config.ts`, `notification_dispatch.ts`,
`notification_sms.ts`, `scheduledNotifications.ts`,
`notificationSettings.ts`, `availabilities.ts`,
`tourCategories.ts`, `tourAnalytics.ts`, `webhookDeliveries.ts`,
`payments_stripe.ts`, `lib/audit.ts`, `lib/crypto.ts`,
`lib/sendEmail.ts`, `lib/notificationRender.ts`, `lib/staffing.ts`,
`lib/staffingGaps.ts`, `lib/validation.ts`, `lib/siteUrl.ts`,
`lib/time.ts`, `ota/upsert.ts`, `ota/webhook_handler.ts`, and all
7 OTA provider files (airbnb, booking, expedia, getyourguide,
klook, tripadvisor, viator).

### P2 — Medium (fixed)

45. **`ota/webhook_handler.ts dispatchEvent` doesn't handle
    `availability.update`** — the `upsertAvailabilityCache`
    mutation is defined in `ota/upsert.ts` but never called.
    `availability.update` events are normalized by providers but
    silently dropped. Fixed in `convex/ota/webhook_handler.ts`:
    `dispatchEvent` now handles `availability.update` and
    dispatches to `upsertAvailabilityCache`.

46. **`organizations.listMembers` sequential `loadUserContact`
    lookups** — up to 200 sequential `await loadUserContact()`
    calls (one per member). Fixed in
    `convex/organizations.ts`: now uses `Promise.all` to batch
    all enrichment lookups.

47. **`tourAnalytics.runDaily` schedules orgs sequentially** —
    same pattern as the reminders crons fixed in round 5.
    Fixed in `convex/tourAnalytics.ts`: now uses `Promise.all`.

### P3 — Low (fixed)

48. **`tourAnalytics.internalUpsert` audit log `oldValues` is
    empty** — same pattern as the `otaProducts` fix from round
    5. Fixed in `convex/tourAnalytics.ts`: now populates
    `oldValues` with the existing row's key metrics.

49. **`tourCategories.internalUpdate` audit log `oldValues` only
    captures `name`** — should capture all changed fields for
    audit trail completeness. Fixed in
    `convex/tourCategories.ts`: now captures old values for all
    changed fields in the update.

### Files audited and found clean

- `authz.ts` — RBAC definitions, correct role/statement mapping
- `auth.config.ts` — standard Better Auth config provider
- `notification_dispatch.ts` — proper channel selection, consent
  checks, error handling
- `notification_sms.ts` — Twilio integration with encrypted token
  decryption, proper error recording
- `scheduledNotifications.ts` — correct reminder scheduling,
  past-time skip
- `notificationSettings.ts` — proper encryption of Twilio token,
  safe defaults, audit logging
- `availabilities.ts` — org-scoped compound index, proper
  tenant isolation
- `webhookDeliveries.ts` — idempotent delivery recording, proper
  org scoping
- `payments_stripe.ts` — correct HMAC-SHA256 verification,
  timing-safe comparison, timestamp tolerance
- `lib/audit.ts` — clean helper
- `lib/crypto.ts` — AES-256-GCM, proper key handling
- `lib/sendEmail.ts` — proper SES integration, env fallback
- `lib/notificationRender.ts` — HTML escaping for email
  templates, fallback copy
- `lib/staffing.ts` — clean staffing rules
- `lib/staffingGaps.ts` — correct gap computation
- `lib/validation.ts` — comprehensive input validation
- `lib/siteUrl.ts` — clean URL helper
- `lib/time.ts` — robust date parsing with round-trip check
- `ota/upsert.ts` — proper org verification, commission clamping
- All 7 OTA provider files — clean normalizers with type guards

### Verification

- `npx tsc --noEmit -p convex/tsconfig.json` — passes
- `pnpm vitest run` (changed files) — 41/41 pass
- `pnpm lint` — passes

## Backend audit round 8 (2026-07-28)

Deep audit of core business logic: `bookings.ts` (1439 lines),
`payments.ts` (844 lines), `payments_stripe_actions.ts` (888 lines).
Focus on audit-trail completeness, unbounded queries, and reminder
scheduling correctness.

### P2 — Medium (fixed)

50. **`bookings.create` schedules reminders with raw args instead
    of resolved schedule date/time** — when a `scheduleId` is
    linked, the booking row gets `schedule.date`/`schedule.startTime`
    but `scheduleForBooking` was called with `args.date`/
    `args.startTime`. Reminders would fire at the wrong time if
    the schedule's date/time differed from the args. Fixed in
    `convex/bookings.ts`: now uses the resolved `date`/`startTime`.

51. **`bookings.clearPendingBookingReminders` uses unbounded
    `.collect()`** — a booking with pathological data could have
    hundreds of pending reminders. Fixed in `convex/bookings.ts`:
    now uses `.take(20)` (well above the legitimate max of ~3).

52. **`bookings.performCancel` pending notifications `.collect()`
    (unbounded)** — same issue as #51. Fixed in
    `convex/bookings.ts`: now uses `.take(20)`.

53. **`payments.recordFromAction` missing audit log** — unlike
    `payments.record` (which logs), the internal `recordFromAction`
    mutation (used by Stripe webhook + public booking flow) created
    payment rows with no audit trail. Fixed in
    `convex/payments.ts`: now writes a `payment.recorded_from_action`
    audit log row.

54. **`payments.upsertSettings` missing audit log** — Stripe
    settings creates/updates (including enabling/disabling Stripe,
    changing deposit %, changing currency) had no audit trail.
    Fixed in `convex/payments.ts`: now writes
    `paymentSettings.created` / `paymentSettings.updated` audit
    rows (secrets excluded from log values).

### P3 — Low (fixed)

55. **`bookings.performUpdate` audit log `oldValues` was empty** —
    the `changes` object already tracked `{old, new}` pairs but
    `oldValues` was `{}` and `newValues` was `{changes}` (nested).
    Fixed in `convex/bookings.ts`: now flattens into
    `oldValues`/`newValues` maps of field → value.

### Tests added

- 3 new tests in `convex/__tests__/payments.test.ts` for audit
  logging: `recordFromAction`, `markSucceeded`, `markRefunded`
  all verify audit log rows are written with correct old/new
  values.
- Updated existing `bookings.test.ts` audit log test to match
  the new flattened `oldValues`/`newValues` format.

### Verification

- `npx tsc --noEmit -p convex/tsconfig.json` — passes
- `pnpm vitest run` (changed files) — all new tests pass,
  pre-existing flaky timeouts unchanged
- `pnpm lint` — passes

## Backend audit round 9 (2026-07-28)

Deep audit of `assignments.ts` (1576 lines — the largest single
file in the backend). Focus on audit-trail completeness, redundant
queries, and code correctness.

### P2 — Medium (fixed)

56. **`assignments.internalUpdate` redundant `sameDay` query** —
    the same `by_tour_date` index scan was executed twice
    (once inside the guide-change conditional, once unconditionally
    for fleet checks). Fixed in `convex/assignments.ts`: hoisted
    the query + `activeOnSlot` filter above the conditional so
    both code paths share one query.

57. **`assignments.internalCreate` redundant schedule fetch** —
    `ctx.db.get(scheduleId)` was called at the top of the handler
    (for org/status validation), then again later for vehicle
    capacity vs `scheduleRow.capacityBooked`. Fixed in
    `convex/assignments.ts`: hoisted `schedule` variable so the
    second call reuses the already-fetched doc.

### P3 — Low (fixed)

58. **`assignments.internalUpdate` audit log `oldValues`
    incomplete** — only captured `guideId`, `date`, `startTime`.
    Missing `vehicleId`, `driverId`, `endTime`. Fixed in
    `convex/assignments.ts`: now captures all fields.

59. **`assignments.internalRemove` audit log `oldValues` empty** —
    soft-delete audit row had no old values. Fixed in
    `convex/assignments.ts`: now captures `status`, `guideId`,
    `date`, `startTime`.

60. **`assignments.list` broken indentation** — `const member` at
    column 0 instead of indented. Fixed in
    `convex/assignments.ts`: proper 2-tab indentation.

### Tests added

- 2 new tests in `convex/__tests__/assignments.test.ts`:
  - `update writes audit log with complete oldValues` — verifies
    `oldValues` includes `guideId`, `endTime` (not just the
    previously-incomplete subset)
  - `soft delete writes audit log with oldValues` — verifies
    `oldValues` is populated with `status`, `guideId`, `date`

### Verification

- `npx tsc --noEmit -p convex/tsconfig.json` — passes
- `pnpm vitest run convex/__tests__/assignments.test.ts` — 28/28 pass
- `pnpm lint` — passes

## Backend audit round 10 (2026-07-28)

Deep audit of 11 files: `tourSchedules.ts`, `customers.ts`, `drivers.ts`,
`vehicles.ts`, `vacationRequests.ts`, `tourBlackoutDates.ts`,
`notifications.ts`, `notification_sms.ts`, `notificationSettings.ts`,
`notificationTemplates.ts`. Two parallel subagents scanned for PII leaks,
missing audit logs, incomplete oldValues, unbounded queries, and org-scoping.

### P1 — Critical: PII leaked into audit logs (fixed)

Audit logs are stored in plaintext and may be exported for compliance.
PII fields (email, phone, name, license info, message text) must not
appear in `oldValues`/`newValues`.

61. **`customers.ts` create audit log** — logged `email` + `name` in
    `newValues`. Fixed: now logs only `source` (non-PII).
62. **`customers.ts` remove audit log** — logged `email` + `name` in
    `oldValues`. Fixed: now logs `source`, `vipStatus`, `totalVisits`.
63. **`drivers.ts` create audit log** — logged `licenseInfo` (may
    contain driver's license number) in `newValues`. Fixed: now logs
    only `userId`.
64. **`drivers.ts` update audit log** — logged full `patch` which
    could include `licenseInfo`. Fixed: strips PII fields from log.
65. **`notifications.ts` immediate dispatch audit log** — logged
    `recipient` (email/phone) + `subject` (may contain customer name).
    Fixed: now logs only `channel`, `templateName`, `error`.
66. **`notificationTemplates.ts` test_send audit log** — logged
    `recipient` (email/phone). Fixed: now logs only `channel`, `status`.

### P2 — Missing audit logs (fixed)

67. **`notifications.ts` cleanupOldAssignments** — bulk-archived
    assignments with no audit trail. Fixed: writes
    `assignments.bulk_archived` audit row with count + cutoffDate.
68. **`notifications.ts` cleanupOldNotifications** — bulk-deleted
    notification logs with no audit trail. Fixed: writes
    `notifications.bulk_cleaned` audit row with counts.
69. **`notification_sms.ts` recordSmsMessage** — created SMS message
    records with no audit trail. Fixed: writes `sms.recorded` audit
    row (PII stripped: no recipientPhone/recipientName/messageText).
70. **`notificationSettings.ts` internalUpsert update path** —
    updated settings with no audit trail (only insert path had one).
    Fixed: writes `notification_settings.updated` audit row with
    all changed fields.

### P3 — Incomplete audit log oldValues (fixed)

71. **`tourSchedules.ts` internalUpdate** — `oldValues` only had
    `date` + `status`. Fixed: now captures all changed fields.
72. **`tourSchedules.ts` internalRemove** — `oldValues` only had
    `date`. Fixed: now captures `tourId`, `date`, `startTime`,
    `status`, `capacityTotal`, `capacityBooked`.
73. **`customers.ts` update** — `oldValues` was empty `{}` despite
    tracking changes. Fixed: flattens `changes` into
    `oldValues`/`newValues` maps (PII fields excluded).
74. **`drivers.ts` internalUpdate** — `oldValues` only had `isActive`.
    Fixed: now captures all changed fields (PII stripped).
75. **`vehicles.ts` internalUpdate** — `oldValues` only had `name`.
    Fixed: now captures all changed fields.
76. **`vacationRequests.ts` internalApprove** — `oldValues` only had
    `status`. Fixed: now captures `status`, `reviewedBy`, `reviewedAt`.
77. **`vacationRequests.ts` internalReject** — same as approve.
    Fixed: now captures `status`, `reviewedBy`, `reviewedAt`.
78. **`tourBlackoutDates.ts` internalUpdate** — `oldValues` was empty
    `{}`. Fixed: flattens `changes` into `oldValues`/`newValues`.
79. **`notificationSettings.ts` internalUpsert insert** — `newValues`
    only had `twilioEnabled`. Fixed: now logs all set fields.
80. **`notificationSettings.ts` internalRemove** — `oldValues` was
    empty. Fixed: captures `twilioEnabled`, `emailEnabled`,
    `staffingDigestEnabled`, `availabilityReminderEnabled`.
81. **`notificationTemplates.ts` internalUpdate** — `oldValues` only
    had `name`. Fixed: now captures all changed fields.
82. **`notificationTemplates.ts` internalRemove** — `oldValues` only
    had `name`. Fixed: captures `name`, `channel`, `isActive`,
    `sendTiming`.

### Tests updated

- `immediate_dispatch.test.ts`: updated success audit log test to
  verify PII fields (recipient, subject) are NOT logged, and
  `templateName` IS logged.

### Verification

- `npx tsc --noEmit -p convex/tsconfig.json` — passes
- `pnpm vitest run` — 480/480 tests pass across 50 test files
- `pnpm lint` — passes

## Backend audit round 11 (2026-07-28)

Deep audit of 22 files across 3 parallel subagents: `http.ts`, `crons.ts`,
`files.ts`, `analytics.ts`, `authz.ts`, OTA directory (`webhook_handler.ts`,
`webhook_verify.ts`, `integrations_mutations.ts`, `integrations.ts`,
`upsert.ts`), and 12 remaining backend files (`tourExceptionDates.ts`,
`tourSeasonalSchedules.ts`, `tourTemplates.ts`, `tourImages.ts`,
`otaProducts.ts`, `userProfiles.ts`, `webhookDeliveries.ts`,
`staffingDigest.ts`, `scheduledNotifications.ts`, `phoneReminders.ts`,
`availabilityReminders.ts`, `assignmentNotifications.ts`).

### Clean files (no issues found)
- `http.ts` — thorough input validation, origin allowlist, body size limit
- `crons.ts` — only registers cron jobs
- `analytics.ts` — proper authz, bounded scans, IDOR fixed previously
- `authz.ts` — RBAC definitions only
- `webhook_verify.ts` — proper signature validation
- `integrations.ts` — proper org-scoping, stripSecrets removes sensitive fields
- `otaProducts.ts` — correct oldValues pattern (model for other files)
- `webhookDeliveries.ts` — no issues
- `scheduledNotifications.ts` — no issues
- `staffingDigest.ts` — trigger operation, empty oldValues acceptable
- `availabilityReminders.ts` — trigger operation, empty oldValues acceptable
- `assignmentNotifications.ts` — trigger operations, empty oldValues acceptable

### P1 — PII leak in audit log (fixed)

83. **`userProfiles.ts` updatePhone** — logged phone number in
    `newValues`. Fixed: now logs only `phoneUpdated: true/false`.

### P2 — Unbounded .collect() calls (fixed)

84. **`tourSeasonalSchedules.ts` generate** — 3 unbounded `.collect()`
    calls on seasonal schedules, exceptions, and blackouts. Fixed:
    all changed to `.take(500)`.
85. **`tourImages.ts` internalReorder** — 1 unbounded `.collect()`
    on tour images. Fixed: changed to `.take(500)`.

### P2 — Missing audit logs in OTA mutations (fixed)

86. **`ota/integrations_mutations.ts` createInternal** — no audit
    log. Fixed: writes `ota_integration.created` (secrets excluded).
87. **`ota/integrations_mutations.ts` updateInternal** — no audit
    log. Fixed: writes `ota_integration.updated` with complete
    oldValues (secrets redacted as `[REDACTED]`).
88. **`ota/integrations_mutations.ts` removeInternal** — no audit
    log. Fixed: writes `ota_integration.deleted`.
89. **`ota/upsert.ts` upsertOtaBooking** — no audit log on create
    or update. Fixed: writes `ota_booking.created`/`ota_booking.updated`
    (PII stripped: no customer name/email/phone).
90. **`ota/upsert.ts` cancelOtaBooking** — no audit log. Fixed:
    writes `ota_booking.cancelled`.
91. **`ota/upsert.ts` upsertAvailabilityCache** — no audit log on
    create or update. Fixed: writes `ota_availability.created`/
    `ota_availability.updated`.

### P3 — Incomplete oldValues in audit logs (fixed)

92. **`tourSeasonalSchedules.ts` internalUpdate** — `oldValues` was
    empty. Fixed: flattens `changes` into `oldValues`/`newValues`.
93. **`tourExceptionDates.ts` internalUpdate** — `oldValues` was
    empty. Fixed: flattens `changes` into `oldValues`/`newValues`.
94. **`tourTemplates.ts` internalUpdate** — `oldValues` only had
    `name`. Fixed: now captures all changed fields.
95. **`tourImages.ts` internalUpdate** — `oldValues` was empty.
    Fixed: flattens `changes` into `oldValues`/`newValues`.
96. **`tourImages.ts` internalReorder** — `oldValues` was empty.
    Fixed: now captures `imageCount`.
97. **`userProfiles.ts` updatePhone** — `oldValues` was empty.
    Fixed: now captures `phoneUpdated: false`.
98. **`phoneReminders.ts` sendReminders** — `oldValues` was empty.
    Fixed: now captures `phoneRemindLastBulkAt`.
99. **`files.ts` internalRemove** — `oldValues` included `filename`
    (potential PII). Fixed: stripped filename, keeps `purpose` + `size`.

### Verification

- `npx tsc --noEmit -p convex/tsconfig.json` — passes
- `pnpm vitest run` — 480/480 tests pass across 50 test files
- `pnpm lint` — passes

## Backend audit round 12 (2026-07-28)

Deep audit of 38 files across 4 parallel subagents: all `convex/lib/`
helpers (12 files), payments/orgs/tours/schema (7 files), auth + betterAuth
(7 files), and OTA provider webhooks (7 files + shared handler).

### Clean files (no issues found)
- `lib/audit.ts` — minimal helper, no issues
- `lib/time.ts` — round-trip validation catches invalid dates
- `lib/staffing.ts` — helper functions, no issues
- `lib/staffingGaps.ts` — pure computation, no issues
- `lib/notificationRender.ts` — HTML escaping present, ALLOWED_VARS whitelist
- `lib/phoneRemindCooldown.ts` — pure computation, no issues
- `lib/userContact.ts` — proper type assertions for Better Auth adapter
- `lib/sendEmail.ts` — SES integration, no issues
- `lib/validation.ts` — email regex + length limits present
- `payments_stripe.ts` — proper HMAC-SHA256 with timing-safe comparison
- `payments_stripe_actions.ts` — webhook sig verified before state changes
- `organizations.ts` — proper org-scoping, MAX_ENRICH cap
- `tourCategories.ts` — well-implemented CRUD with complete audit logs
- `tours.ts` — comprehensive validation, good defense-in-depth
- `schema.ts` — all sensitive fields marked encryptedString
- `auth.config.ts`, `betterAuth/adapter.ts`, `betterAuth/schema.ts`,
  `convex.config.ts` — minimal config files, no issues
- All 7 OTA provider webhook files — thin wrappers delegating to
  shared handler with proper signature verification

### P1 — HTML injection in email templates (fixed)

100. **`auth.ts` invitation email** — `orgName` and `data.email`
     were interpolated into HTML without escaping. If an org name
     contained `<script>` or other HTML, it would execute in email
     clients. Fixed: added `escHtml()` helper that escapes
     `&`, `<`, `>`, `"`, `'` before interpolation.

### P2 — Security hardening (fixed)

101. **`lib/crypto.ts` fromHex()** — only checked hex length was
     even, didn't validate characters were valid hex. Invalid
     characters would produce `NaN` bytes, causing silent
     decryption failures. Fixed: added `/^[0-9a-fA-F]*$/` regex
     validation before parsing.

102. **`lib/rate_limit.ts` IP rate limit bypass** — when IP was
     missing/empty, `collectRecentAttemptsByIp()` returned `[]`,
     completely bypassing the IP rate limit. An attacker could
     omit the IP header to spray bookings. Fixed: missing IP is
     now treated as `"unknown"` bucket, so the IP rate limit
     still applies.

103. **`lib/siteUrl.ts` insecure HTTP default** — no warning when
     `SITE_URL` is HTTP in production. Fixed: logs a warning when
     `SITE_URL` is HTTP and not localhost/127.0.0.1.

### P3 — Incomplete oldValues (fixed)

104. **`tourAnalytics.ts` internalUpsert** — `oldValues` only
     captured 5 of 10 changed fields (missing `cancellations`,
     `noShows`, `avgGroupSize`, `utilizationRate`, `totalCapacity`).
     `newValues` was similarly incomplete. Fixed: both now capture
     all 10 fields.

### Noted but not fixed (lower priority / by design)

- **`auth.ts` `requireEmailVerification: false`** — intentional
  for dev; must be `true` in production. Documented in auth config.
- **`betterAuth/generatedSchema.ts` OAuth tokens stored as plain
  strings** — this is Better Auth's schema; encryption is the
  application's responsibility (handled via `encryptedString` in
  our schema for our own fields).
- **`webhook_verify.ts` replay protection optional when timestamp
  header missing** — intentional per comments; HMAC still required.
- **`webhook_handler.ts` raw payload stored in webhookDeliveries**
  — may contain PII; this is the delivery audit trail. Retention
  is bounded by `cleanupOldNotifications` cron.
- **`rate_limit.ts` TOCTOU race** — inherent to Convex's
  transactional model; the rate limit is a best-effort defense,
  not a hard guarantee. Acceptable for public booking throttling.

### Verification

- `npx tsc --noEmit -p convex/tsconfig.json` — passes
- `pnpm vitest run` — 480/480 tests pass across 50 test files
- `pnpm lint` — passes

## Frontend audit round 13 (2026-07-28)

Deep audit of 125 frontend files across 4 parallel subagents: auth/lib/
public routes (20 files), dashboard routes batch 1 (17 files), dashboard
routes batch 2 (30 files), and components (36 files).

### Clean files (no issues found)
- `lib/auth-client.ts`, `lib/validation.ts`, `lib/public-booking-form.ts`,
  `lib/format.ts`, `lib/utils.ts`, `lib/time.ts`, `lib/calendar-date.ts`,
  `lib/date-range.ts`, `lib/staffing.ts` — all clean
- `router.tsx`, `start.ts` (CSP headers well-configured), `__root.tsx` — clean
- `sign-in.tsx`, `sign-up.tsx`, `api/auth/$.ts` — clean
- All UI components (`ui/*.tsx`) — clean, no dangerouslySetInnerHTML
- `data-table.tsx`, `detail-page.tsx`, `entity-form.tsx`, `form.tsx`,
  `forms/form-field.tsx`, `list-page.tsx`, `metric-card.tsx`,
  `status-badge.tsx`, `status-styles.ts`, `tour-cell.tsx`,
  `tour-revenue-bars.tsx`, `stripe-payment-element.tsx` — clean
- `types/entities.ts` — type definitions only
- Most dashboard routes — good form validation, loading states, error boundaries

### P1 — Open redirect (fixed)

105. **`auth.callback.tsx`** — the `redirect` search param was used
     directly in `navigate()`, allowing an attacker to craft a URL
     like `/auth/callback?ott=xyz&redirect=https://evil.com` to
     redirect users to a malicious site after authentication.
     Fixed: `validateSearch` now only accepts relative paths starting
     with `/` but not `//` (protocol-relative URLs).

### P2 — Missing error handling (fixed)

106. **`invite/$invitationId.tsx`** — the `getInvitation` auth call
     had no try-catch; an unhandled rejection would crash the page.
     Fixed: wrapped in try-catch with user-friendly error message.

107. **`nav-bar.tsx`** — `handleSwitchOrg` caught errors silently
     with no user feedback. Fixed: added `toast.error()` on failure.

### P2 — href sanitization (fixed)

108. **`bookings/$bookingId.tsx`** — `mailto:` and `tel:` hrefs
     used raw DB values. If email/phone contained malicious
     characters, could lead to protocol injection. Fixed: added
     `safeMailto()` and `safeTel()` helpers that validate format
     and strip dangerous characters.

### Noted but not fixed (lower priority / by design)

- **Secrets in React state** (`payments.tsx`, `ota.tsx`,
  `notification-settings-page.tsx`) — Stripe keys, OTA API secrets,
  and Twilio auth token are handled in client-side state. This is
  inherent to the admin settings UI pattern — secrets are entered
  by admins, sent to backend, and cleared from state. The backend
  encrypts them at rest. A full refactor to server-only secret
  entry would require a separate admin endpoint design.
- **Missing `beforeLoad` auth guards on dashboard routes** — auth
  is enforced at the layout level in `dashboard.tsx`. TanStack
  Router best practice is `beforeLoad` but the current layout guard
  is functional. Adding `beforeLoad` to 30+ routes is a refactor,
  not a security fix.
- **No RBAC at route level** — all authenticated org members can
  access all dashboard routes. RBAC is enforced on the backend
  via `requireRole`. Frontend RBAC would be UX-only.
- **`window.confirm` for destructive actions** — UX issue, not
  security. Custom modals would be nicer but confirm() is
  functionally adequate.
- **iframe `sandbox=""` in notifications preview** — this is
  actually the most restrictive sandbox setting (no scripts, no
  forms, no popups). The subagent flagged it incorrectly.
- **Type assertions (`as Id<...>`)** — Convex validates IDs on
  the backend; client-side assertions are for TypeScript only.
- **Date parsing without timezone** — dates are stored as YMD
  strings (UTC), so `Date.parse()` is used for display only.

### Verification

- `npx tsc --noEmit` — passes
- `pnpm vitest run src/__tests__/` — 76/76 tests pass across 8 test files
- `pnpm lint` — passes

## Backend + config audit round 14 (2026-07-28)

Deep audit of remaining files: config files (vite, tsconfig, package,
playwright, vitest, tsr, convex.config), server functions (__root.tsx,
api/auth/$.ts), public booking flow (public_booking.ts, rate_limit.ts,
http.ts, ota/router.ts), and remaining backend files (availabilities.ts,
notification_dispatch.ts, analytics.ts, scheduledNotifications.ts).

### Clean files (no issues found)
- `vite.config.ts` — localhost-only host, no issues
- `tsconfig.json` — strict mode, no issues
- `playwright.config.ts`, `vitest.config.ts`, `tsr.config.json` —
  test/router config, no issues
- `convex/convex.config.ts` — minimal, no issues
- `api/auth/$.ts` — simple handler delegation, no issues
- `ota/router.ts` — simple route registration, no issues
- `analytics.ts` — all queries bounded with `.take(10_000)`, proper
  org-scoping via `requireMembership`
- `availabilities.ts` — all queries bounded, proper audit logs,
  org-scoped. Consent check inconsistency is intentional (email
  defaults to opt-out, SMS defaults to opt-in for compliance)
- `notification_dispatch.ts` — dispatch results are logged via
  `recordDispatchResult` → `notificationLogs` table (domain-specific
  audit trail, not a generic `logAudit` call, but serves same purpose)
- `start.ts` — comprehensive security headers (HSTS, X-Frame-Options,
  nosniff, Referrer-Policy, Permissions-Policy, CSP)

### P1 — Orphaned booking on capacity failure (fixed)

109. **`public_booking.ts` createForSlug** — the booking was inserted
     BEFORE `incrementBooked` checked capacity. If `incrementBooked`
     threw "over capacity", the booking remained as an orphaned
     "pending" row. Fixed: wrapped `incrementBooked` call in
     try-catch; on failure, cancels the booking via
     `internalCancel` with reason "capacity_exceeded", then re-throws.

### P2 — Missing error handling in server function (fixed)

110. **`__root.tsx` getAuth** — the `getToken()` call had no
     try-catch. If the auth service was unavailable, the error
     would propagate and crash the SSR render. Fixed: returns
     `null` on failure so the client falls back to unauthenticated
     state.

### P2 — Missing audit log (fixed)

111. **`scheduledNotifications.ts` scheduleForBooking** — created
     scheduled notification rows without any audit log. Fixed:
     added `logAudit` call with `scheduled_notifications.created`
     action, capturing count and template types.

### Noted but not fixed (by design / inherent to platform)

- **Rate limit TOCTOU race** (`rate_limit.ts`) — inherent to Convex's
  transactional model; rate limiting is best-effort defense, not a
  hard guarantee. Convex's OCC retries concurrent mutations to the
  same document, so the race window is minimal.
- **IP header spoofing** (`http.ts`) — `cf-connecting-ip` and
  `x-forwarded-for` can be spoofed, but IP rate limiting is
  defense-in-depth alongside email rate limiting.
- **Origin check optional in production** (`http.ts`) — intentional
  for development; operators must set `PUBLIC_BOOKING_ALLOWED_ORIGINS`
  in production.
- **CSP `unsafe-inline` for scripts** (`start.ts`) — required for
  TanStack Start hydration; framework limitation.
- **CORS enabled for auth endpoints** (`http.ts`) — needed for dev
  cross-origin Vite proxy; `trustedOrigins` restricts in production.
- **`updateAttemptOutcome` no authz** (`rate_limit.ts`) — internal
  mutation only, called from the booking action with the attempt ID
  it just created. Not exposed to clients.
- **Consent check inconsistency** (`notification_dispatch.ts`,
  `availabilities.ts`) — `emailConsent !== false` vs
  `smsConsent === true` is intentional: email defaults to opt-out
  (send unless explicitly declined), SMS defaults to opt-in (don't
  send unless explicitly consented). This is a common compliance
  pattern.

### Verification

- `npx tsc --noEmit` (both convex + FE) — passes
- `pnpm vitest run` — 766/766 tests pass across 70 test files
- `pnpm lint` — passes

## Deep dive audit round 15 (2026-07-28)

Deep security review of critical flows: Stripe payments, auth, and test
coverage gap analysis. Also resolved a high-severity dependency
vulnerability.

### Dependency vulnerability resolved

- **sharp <0.35.0** (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590,
  CVE-2026-35591) — transitive dependency via wrangler/miniflare.
  Fixed: updated wrangler 4.112.0 → 4.115.0 and
  @cloudflare/vite-plugin 1.45.1 → 1.48.0. `pnpm audit` now reports
  zero vulnerabilities.

### Stripe payment flow — CLEAN (no issues found)

Deep review of payments.ts, payments_stripe_actions.ts,
payments_stripe.ts, stripe-payment-element.tsx, payments settings page:
- Amount manipulation: PROTECTED (validated against balanceDueCents)
- IDOR: PROTECTED (org-scoping on all checkout actions)
- Webhook signature: EXCELLENT (timing-safe comparison, 5-min replay
  window, uniform responses to prevent org enumeration)
- Secrets encryption: EXCELLENT (AES-256-GCM, never exposed to client)
- Refund for unpaid booking: PROTECTED (checks status === "succeeded")
- Amount immutability: PROTECTED (set at PaymentIntent creation)
- Webhook replay: EXCELLENT (duplicate detection via eventId,
  idempotent state transitions)
- Publishable key: correctly handled as public data

### P1 — Email verification disabled (fixed)

112. **`auth.ts`** — `requireEmailVerification: false` allowed users
     to sign up without verifying email ownership. Combined with the
     invitation flow, this enabled pre-registration attacks (GHSA-
     FMH4-WCC4-5JM3). Fixed: enabled `requireEmailVerification: true`
     in both `createAuth` and `createAuthOptions`, added
     `emailVerification.sendVerificationEmail` callback that sends
     a verification email via SES.

113. **`auth.ts` organization plugin** — no
     `requireEmailVerificationOnInvitation` setting. Fixed: set to
     `true` so invitations can only be accepted with a verified email.

### P1 — Email enumeration via error messages (fixed)

114. **`sign-in.tsx`** — displayed raw Better Auth error messages
     ("user not found" vs "wrong password"), enabling email
     enumeration. Fixed: generic "Invalid email or password" message.

115. **`sign-up.tsx`** — displayed "email already in use" errors,
     enabling email enumeration. Fixed: generic "Could not create
     account" message.

### Noted but not fixed (by design / platform default)

- **Rate limiting on auth endpoints** — Better Auth's built-in rate
  limiting is enabled by default in production (10s window, 100 max
  requests). Custom per-endpoint limits could be added but the
  default is reasonable.
- **Password complexity** — min 8 chars with no complexity requirements.
  Better Auth supports `minPasswordLength` but not regex validation
  in the server config. Client-side complexity could be added to the
  Zod schema, but server-side enforcement would require a custom
  password validator hook.
- **Onboarding bypass** — client-side check in dashboard.tsx. Adding
  `beforeLoad` to 30+ routes is a refactor, not a security fix (backend
  enforces org membership via `requireRole`).
- **Silent org fallback in authz.ts** — documented as a known issue;
  removing it would break existing sessions where no active org is set.

### Test coverage gaps identified

- **payments_stripe_actions.ts** — NO tests (6 exported actions for
  Stripe API integration). HIGHEST PRIORITY gap.
- **crons.ts** — NO tests (8 production cron jobs)
- **http.ts** — NO tests (HTTP security layer)
- **auth.ts** — weak coverage (only 4 trivial env var tests)
- **organizations.ts, userProfiles.ts, webhookDeliveries.ts,
  staffingDigest.ts, ota/integrations.ts** — no tests

### Verification

- `pnpm audit` — zero vulnerabilities
- `npx tsc --noEmit` (both convex + FE) — passes
- `pnpm vitest run` — 766/766 tests pass across 70 test files
- `pnpm lint` — passes

## Round 16 — test coverage expansion (2026-07-29)

Added 38 new tests across 5 new test files, closing the most critical
test coverage gaps identified in round 15.

### New test files

| File | Tests | Coverage |
|------|-------|----------|
| auth_security.test.ts | 7 | requireEmailVerification, requireEmailVerificationOnInvitation, sendVerificationEmail callback, minPasswordLength, isGoogleEnabled, getCurrentUser null when unauthenticated |
| public_booking_security.test.ts | 3 | Orphaned booking compensation (no pending booking when incrementBooked throws), malformed email (no @), email with no domain TLD |
| organizations.test.ts | 7 | activeOrganization, listMyOrganizations, listMembers (with auth rejection) |
| webhookDeliveries.test.ts | 12 | recordDelivery (idempotent), updateDeliveryStatus, listByOrg, listRecent |
| userProfiles.test.ts | 9 | updatePhone (validation + auth), getContact (cross-org rejection), missingStaffPhones, collectMissingStaffPhones |

### Test approach notes

- **Better Auth component limitation**: @convex-dev/better-auth v0.12.5
  does not implement the `join` parameter in its adapter, so
  `auth.api.getSession` always returns null in convex-test. Tests mock
  `../auth` (and sometimes `../lib/userContact`) to drive the real
  query/mutation logic with controlled auth state.
- **Orphaned booking test**: In convex-test, `ctx.runMutation` within
  a mutation runs in the same transaction, so when the parent mutation
  re-throws after the compensating `internalCancel`, the entire
  transaction rolls back — the booking never persists.

### Remaining test gaps (lower priority)

- payments_stripe_actions.ts — still no tests (Stripe API actions)
- crons.ts — no tests (8 production cron jobs)
- http.ts — no tests (HTTP security layer)
- staffingDigest.ts — no tests
- ota/integrations.ts — no tests (read queries)

### Verification

- `npx tsc --noEmit` (both convex + FE) — passes
- `pnpm vitest run` — 804/804 tests pass across 75 test files
- `pnpm lint` — passes

## Round 17 — payments_stripe_actions tests (2026-07-29)

Closed the highest-priority test coverage gap: payments_stripe_actions.ts
was previously completely untested (6 exported actions for Stripe API
integration — the most security-critical payment flows).

### New test file

| File | Tests | Coverage |
|------|-------|----------|
| payments_stripe_actions.test.ts | 21 | All 5 Stripe actions + edge cases |

### Test breakdown

- **createCheckoutSession** (6): PI creation, IDOR (cross-org), amount
  validation, Stripe not configured, Stripe API error, unauthenticated
- **createPublicPaymentIntent** (4): full balance, email mismatch,
  Stripe disabled, invalid email
- **createHostedCheckout** (2): session URL, missing URL
- **createPublicHostedCheckout** (2): email match, email mismatch
- **refundViaStripe** (4): succeeded refund, non-succeeded rejection,
  cross-org IDOR, Stripe API failure
- **assertBookingCheckoutAllowed** (3): cancelled status, zero amount,
  completed status

### Mock approach

- `vi.mock("../auth")` + `vi.mock("../lib/authz")` — bypass Better Auth
  (adapter can't resolve sessions in convex-test)
- `vi.mock("../lib/crypto")` — no-op encrypt/decrypt
- `vi.stubGlobal("fetch", ...)` — simulate Stripe API responses

### Test count progression

- Start of audit: 480 tests
- End of round 16: 818 tests
- End of round 17: **839 tests** across 78 test files
- End of round 18: **839 tests** across 78 test files (no new tests, fixes only)
- End of round 19: **839 tests** across 78 test files (no new tests, fixes only)
- End of round 20: **839 tests** across 78 test files (no new tests, fixes only)
- End of round 21: **856 tests** across 79 test files
- **376 new tests** added total

### Remaining gaps (low priority)

- `crons.ts` — just schedule definitions, no testable logic
- Frontend: replace `window.confirm` with AlertDialog for destructive actions (13 instances)
- Frontend: add Zod validation to dashboard CRUD forms (backend validates)
- Backend: customers.ts email uniqueness has read-then-write race (Convex limitation, no unique constraints)

### Verification

- `npx tsc --noEmit` (both convex + FE) — passes
- `pnpm vitest run` — 839/839 tests pass across 78 test files
- `pnpm lint` — passes

## Round 18 — http.ts hardening + input validation + frontend guards (2026-07-28)

Commit `ea94b64`. Addressed HIGH/MEDIUM issues from frontend + backend review subagents.

### http.ts fixes (4 issues)
1. **Origin validation bypass (HIGH):** Reject requests with missing `Origin` header when `PUBLIC_BOOKING_ALLOWED_ORIGINS` is configured.
2. **Slug path traversal (MEDIUM):** Validate slug format (`/^[a-zA-Z0-9-]+$/`) before use.
3. **Content-Length spoofing (MEDIUM):** Enforce actual body size by counting bytes read, not trusting the `Content-Length` header.
4. **Information disclosure (HIGH):** Sanitize error messages — return generic user-facing messages, log full errors server-side. Treat Convex validator errors as 400 (client error).

### Backend fixes
- **bookings.ts:** Cap `_listByScheduleRaw` at 500 rows (was unbounded `.collect()` — CRITICAL OOM risk).
- **Input length validation** added to 6 files via `assertFieldWithinLimit`:
  - `tourCategories.ts`: name/slug (100), description (2000), icon/color (50)
  - `vehicles.ts`: make/model (100), color/ownershipType (50)
  - `tourSchedules.ts`: notes (1000)
  - `tourSeasonalSchedules.ts`: name (100), startTime (10), notes (1000)
  - `notificationTemplates.ts`: templateType/channel/sendTiming (50)
  - `ota/integrations_mutations.ts`: apiKey/apiSecret/webhookSecret (500), partnerId (100), apiEndpoint (500)

### Frontend fixes
- **Secret input hardening:** Added `maxLength` + `autoComplete="off"` to all secret inputs in `payments.tsx` (Stripe publishable/secret/webhook keys) and `notification-settings-page.tsx` (Twilio Account SID, auth token, phone number, messaging service SID).
- **Dashboard auth guard:** Added `beforeLoad` route-level guard to `/dashboard` route — redirects unauthenticated users to `/sign-in` before any dashboard component renders. Complements existing component-level check.

### Known limitations (not fixed)
- `customers.ts` email uniqueness: read-then-write race condition (Convex has no unique index constraints).
- `window.confirm` for destructive actions: 13 instances across dashboard pages (cosmetic, not a security issue).
- Missing Zod validation on dashboard CRUD forms (backend validates all inputs).

## Round 19 — Stripe URL validation + input limits (2026-07-28)

Commit `dcb0193`. Addressed frontend findings from second-round audit.

### Frontend
- **Stripe URL validation:** New `isStripeCheckoutUrl()` helper validates URLs point to `*.stripe.com` over HTTPS before navigation. Applied in `bookings/$bookingId.tsx` and `book/$slug.tsx` to prevent open redirects.
- **Input maxLength:** Added to `new-tour-page.tsx` (name: 100, description: 2000, languages: 100) and OTA page (product ID: 500, product code: 100).
- **autoComplete="off":** Added to all 3 OTA secret inputs.

### Backend
- **assignments.ts:** Added `guideId` length validation (max 100) in `internalCreate`.

## Round 20 — Config hardening + error sanitization (2026-07-28)

Commit `9c428cd`. Addressed config/dependency audit findings.

### Backend
- **http.ts:** Case-insensitive error pattern matching (was missing "Not found" errors from mutations that use title case).
- **siteUrl.ts:** Throw in production if `SITE_URL` is unset instead of silently defaulting to localhost.
- **crypto.ts:** Remove key length from error message (info leak).
- **notification_sms.ts:** Log JSON parse errors instead of silently swallowing them.

### Frontend
- **getSafeDisplayMessage() helper:** Sanitizes error messages for display — shows generic message for internal/validator errors, passes through ConvexError messages (our own thrown strings). Applied to 16 ErrorBanner usages across dashboard pages and public booking page.

### Config
- **.gitignore:** Added `.env.local` and `.env.*.local`.
- **package.json:** Added `engines` field (node >=20, pnpm >=10).

## Round 21 — http.ts security tests (2026-07-28)

Commit `63c4f64`. Added 17 new tests for the round 18 http.ts security fixes.

### New test file: `public_booking_http_security.test.ts`
- **Origin validation (5 tests):** rejects missing/disallowed origins when allowlist configured, allows valid origins, allows when unset/empty.
- **Slug format validation (6 tests):** rejects path traversal, special chars, oversized slugs; accepts valid alphanumeric/hyphen/underscore slugs.
- **Body size enforcement (3 tests):** rejects >8KB by actual body length, not Content-Length header (spoofed header still rejected).
- **Error sanitization (3 tests):** returns "Invalid request data" for validator errors, no internal details leaked.
