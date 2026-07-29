<!-- fuurma-hub-start -->
## Fuurma Hub Context

This repo is one project inside the Fuurma portfolio workspace. The planner hub
is the source of truth for cross-project priorities, reusable stack decisions,
ports, deploy/auth notes, and agent handoffs.

Before meaningful work, read:
1. Current sprint / next work: `~/Projects/newProjectsPlanner/WORK.md`
2. This project's state page: `~/Projects/newProjectsPlanner/projects/guides-tours.md`
3. Standard stack playbook: `~/Projects/newProjectsPlanner/tech-stack/STACK-STANDARDS.md`
4. Agent skills/context: `~/Projects/newProjectsPlanner/tech-stack/AGENT-CONTEXT.md`
5. Official docs index: `~/Projects/newProjectsPlanner/tech-stack/OFFICIAL-DOCS.md`

Use the deeper hub docs when relevant:
- Auth/OAuth: `~/Projects/newProjectsPlanner/tech-stack/AUTH-OAUTH.md`
- Forms: `~/Projects/newProjectsPlanner/tech-stack/TANSTACK-FORM.md`
- Deploy/launch: `~/Projects/newProjectsPlanner/tech-stack/SHIP-KIT.md`
- Ports: `~/Projects/newProjectsPlanner/tech-stack/PORTS.md`
- Secrets/accounts: `~/Projects/newProjectsPlanner/tech-stack/ACCOUNTS-SECRETS.md`

Operational rules:
- Run `git status --short --branch` before editing and protect dirty user/agent work.
- Product repo code/tests are the immediate truth; when they disagree with the hub, update the hub after verifying.
- After reading the hub pointers, keep reading this file's repo-local instructions; they are the authority for this codebase.
- Use `pnpm@10.30.2` unless this repo explicitly documents a different toolchain.
- When you learn a reusable pattern, fix, or project-state change, update `~/Projects/newProjectsPlanner` so the next agent starts stronger.

### Agent skills and generated guidance

When one of these global skills matches your work, **invoke it immediately** at the start of the session:
- `shadcn` — adding, fixing, or reviewing shadcn/ui components and Tailwind v4 styling.
- `convex` — routing Convex work to the right helper skill (quickstart, auth, components, migrations, performance audit).
- `stripe-best-practices` — checkout, billing, subscriptions, webhooks, Connect, key handling.
- `workers-best-practices` / `durable-objects` / `cloudflare` — Cloudflare Workers, Wrangler, bindings, Durable Objects, Agents SDK.
- `cloudflare-email-service` / `turnstile-spin` — when adding those services.
- `convex-setup-auth`, `convex-create-component`, `convex-migration-helper`, `convex-performance-audit` — repo-local Convex skills when present.

For Convex repos, run `npx convex ai-files install` first if `convex/_generated/ai/guidelines.md` is missing or stale.

For UI work, use `pnpm dlx shadcn@latest` and follow the `shadcn` skill rules (no `space-x/y`, use `gap-*`, `size-*`, `cn()`, semantic tokens, lucide icons, `FieldGroup`/`Field`, etc.).

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
