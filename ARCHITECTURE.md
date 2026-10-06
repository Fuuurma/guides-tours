# guides-tours — Architecture

Multi-tenant tour-operator console: TanStack Start (SSR) frontend over a
Convex backend, deployed to Cloudflare Workers. Better Auth carries identity
and org scoping; Stripe runs checkout/refunds via signed webhooks; OTA
providers (Viator et al.) integrate through a dedicated webhook → upsert
pipeline; notifications fan out over SMS and push on crons.

The architecture, drawn: **[diagrams/architecture.html](diagrams/architecture.html)** (diagram-design editorial HTML — refresh it when modules or data flows change; never redraw it as Mermaid). Spine: the TanStack Start SSR app feeds a Convex backend hub that fans out to the domain core, payments, OTA pipeline and notifications, while Stripe and OTA providers enter through signed webhooks at convex/http.ts.

## Modules

- src/routes — TanStack Start app: operator dashboard, public booking funnel
- convex/bookings · tours · tourSchedules — domain core and availability
- convex/assignments · drivers · availabilities — staffing and scheduling
- convex/payments · payments_stripe_actions · payments_stripe.ts — Stripe checkout, refunds, webhook-verified ledger
- convex/ota — provider integrations: webhook_handler, upsert, integrations_mutations
- convex/notifications* · phoneReminders · scheduledNotifications · crons.ts — dispatch, SMS, reminder crons
- convex/auth.ts · betterAuth/ · auth.config.ts · authz.ts — Better Auth + fail-closed org authorization
- convex/public_booking.ts — unauthenticated public booking endpoint
- convex/organizations.ts — org membership queries
- convex/analytics · tourAnalytics — overview/revenue stats + pre-computed per-tour cache
- convex/ops — operator one-shot: publish departure + assign crew
- convex/staffingDigest · availabilityReminders — crew digests and availability nudges
- convex/stripeEvents.ts — Stripe webhook idempotency gate
- convex/lib — validation, crypto, assignmentsLifecycle shared seams
- convex/http.ts — webhook surface (Stripe, OTA) with signature verification
