# Deployment

guides-tours deploys to two services: **Convex** (backend) and **Cloudflare Workers** (frontend).

## One-time setup

### 1. Install wrangler (Cloudflare CLI)

Already in devDependencies. Authenticate:

```bash
npx wrangler login
```

### 2. Create Cloudflare Worker + project

In the Cloudflare dashboard, create a new Worker project. Link this repo or set the name in `wrangler.jsonc` (`"name": "guides-tours"`).

### 3. Set Convex project

```bash
npx convex dev    # first run creates the dev deployment
npx convex deploy --prod   # creates the prod deployment
```

Note the prod URL — it goes into `wrangler.jsonc` as `VITE_CONVEX_URL`.

## Environment variables

### Cloudflare Worker (via `wrangler secret put` or dashboard)

| Var | Source | Notes |
|---|---|---|
| `SITE_URL` | this app's prod URL | e.g. `https://guides-tours.fuurma.tech` |
| `VITE_CONVEX_URL` | from `npx convex deploy --prod` output | auto-injected at build time |

### Convex (via `npx convex env set` or dashboard)

| Var | Required for | Notes |
|---|---|---|
| `BETTER_AUTH_SECRET` | auth | `openssl rand -base64 32` |
| `SITE_URL` | auth | must match Cloudflare Worker URL |
| `STRIPE_SECRET_KEY` | payments | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | payments | from Stripe dashboard |
| `AWS_REGION` | SES email | e.g. `us-east-1` |
| `AWS_ACCESS_KEY_ID` | SES email | IAM user with `ses:SendEmail` |
| `AWS_SECRET_ACCESS_KEY` | SES email | same IAM user |
| `SES_FROM_ADDRESS` | SES email | verified sender in SES |
| `OTA_VIATOR_API_KEY` | Viator | optional, per provider |
| `OTA_GETYOURGUIDE_API_KEY` | GetYourGuide | optional |
| `OTA_AIRBNB_API_KEY` | Airbnb | optional |
| `OTA_TRIPADVISOR_API_KEY` | TripAdvisor | optional |
| `OTA_KLOOK_API_KEY` | Klook | optional |
| `OTA_BOOKING_API_KEY` | Booking.com | optional |
| `OTA_EXPEDIA_API_KEY` | Expedia | optional |

## Deploy

```bash
# Backend (Convex)
npx convex deploy --prod

# Frontend (Cloudflare Worker)
npm run build
npx wrangler deploy
```

## Post-deploy verification

1. Visit the Worker URL — landing page should load
2. Sign up a new account — Better Auth should issue a session
3. Onboarding should create an org
4. Dashboard should show empty state for all modules
5. Create a tour + schedule + booking — end-to-end smoke test
6. `/book/<org-slug>` — public booking page should list active tours
7. Check Convex dashboard for cron runs (`process_pending_notifications`)

## OTA webhook URLs (to give to providers)

| Provider | Webhook URL |
|---|---|
| Viator | `https://<worker-url>/api/ota/webhooks/viator` |
| GetYourGuide | `https://<worker-url>/api/ota/webhooks/getyourguide` |
| Airbnb | `https://<worker-url>/api/ota/webhooks/airbnb` |
| TripAdvisor | `https://<worker-url>/api/ota/webhooks/tripadvisor` |
| Klook | `https://<worker-url>/api/ota/webhooks/klook` |
| Booking.com | `https://<worker-url>/api/ota/webhooks/booking` |
| Expedia | `https://<worker-url>/api/ota/webhooks/expedia` |

Each provider has its own signature verification in `convex/ota/` — register the shared secret they give you in the org's `otaIntegrations` record.

## Custom domain

In Cloudflare dashboard, add a custom domain to the Worker (e.g. `guides-tours.fuurma.tech`). Update `SITE_URL` in both Convex and Cloudflare to match.
