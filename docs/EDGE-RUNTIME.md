# Edge-Runtime Integrations

This project runs on Cloudflare Workers (frontend via TanStack Start + Nitro)
and Convex (backend). Both runtimes are V8 isolates with limited Node.js
APIs — specifically **no `node:crypto`** without a `"use node"` directive,
which itself blocks Cloudflare compatibility.

Two third-party SDKs are intentionally replaced with hand-rolled fetch +
Web Crypto implementations:

## AWS SES — `convex/lib/awsSigV4.ts`

AWS provides `@aws-sdk/client-sesv2`, but it pulls in Node-only modules
(`@aws-sdk/signature-v4` + `node:crypto` + `node:stream`). On Convex,
those imports would force a `"use node"` directive on `convex/http.ts`
or `convex/actions.ts`, which conflicts with the rest of the codebase
that uses Web Crypto + fetch.

We instead sign requests ourselves with HMAC-SHA256 from the Web Crypto
API. Trade-offs:

- ✅ No Node-only deps; works in Convex default runtime + Workers + Node 20+
- ✅ ~165 LoC; transparent behavior; testable without mocks
- ⚠️ Future AWS SDK features (new SES APIs, SigV4a, etc.) need manual porting
- ⚠️ Not all AWS services are covered — only what we use (`SendEmail`)

`convex/__tests__/awsSigV4.test.ts` validates the signing against
published AWS test vectors.

## Stripe — `payments_stripe_actions.ts`, `payments_stripe.ts`

Same constraint: the official `stripe` Node SDK requires Node-only modules
(`crypto`, `http`, `stream`). For Cloudflare Workers, Stripe publishes
a separate `stripe-cloudflare-workers` package — but using it from
Convex actions would still force `"use node"`.

Instead, we call the Stripe REST API via `fetch` and verify webhook
signatures ourselves with the same HMAC-SHA256 pattern. This:

- ✅ Works in Convex default runtime (no `"use node"` needed)
- ✅ No SDK version-coupling; Stripe API changes don't surprise us
- ✅ Stripe SDK on Workers would also need bundler-specific config
- ⚠️ Stripe SDK features (idempotency helpers, type defs) are absent
- ⚠️ Future Stripe API surface must be hand-wired

`convex/__tests__/payments_stripe_webhook.test.ts` covers signature
verification + dispatch paths.

## When to switch

If we hit a clear blocker (e.g. Stripe Connect, SES templates that
require SDK-only helpers), the migration path is:

1. Add `"use node"` directive on the affected file(s) only.
2. Replace the hand-rolled helpers with the official SDK calls.
3. Verify Convex still accepts the action/query (it's per-file, not
   global, so other code is unaffected).
4. Delete the now-unused `convex/lib/awsSigV4.ts` and the inline
   Stripe signature code.

Until then, **edge-runtime exceptions are deliberate**, not drift.
