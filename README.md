# guides-tours

Tour operator SaaS — destination repo for the canonical codebase after migration.

## Status
- **Stage:** building
- **Phase:** 2 (Foundation) — TanStack Start + Convex + Better Auth scaffolded
- **Migration plan:** [`newProjectsPlanner/migrations/2026-06-deployment-and-convergence.md`](../../newProjectsPlanner/migrations/2026-06-deployment-and-convergence.md) §guides-tours
- **Port checklist:** [PORT-CHECKLIST.md](./PORT-CHECKLIST.md) (from reservations-automation)

## Source codebases
- **Canonical source:** [Fuuurma/reservations-automation](https://github.com/Fuuurma/reservations-automation) (Django 5 + Next.js 16)
- **Dropped:** [Fuuurma/Tour-Management-SaaS](https://github.com/Fuuurma/Tour-Management-SaaS)

## Stack (standard, per CONVENTIONS.md)
- TanStack Start (React 19, file-based routing)
- Convex (DB, auth, realtime, cron, storage)
- Better Auth via `@convex-dev/better-auth` (org plugin planned for Phase 4)
- Tailwind v4 + shadcn/ui (radix, new-york style)
- Stripe (raw SDK in Convex action) — Phase 8
- Amazon SES via `@aws-sdk/client-sesv2` — Phase 7
- Cloudflare Workers deploy via Nitro preset (Vite `@cloudflare/vite-plugin`)
- Vitest + Testing Library

## First-time setup

1. Copy env template: `cp .env.example .env.local`
2. Run `npx convex dev` to provision the Convex deployment and write `CONVEX_DEPLOYMENT` + `VITE_CONVEX_URL` + `VITE_CONVEX_SITE_URL` into `.env.local`
3. Run `npx convex env set BETTER_AUTH_SECRET=$(openssl rand -base64 32)` to set the auth secret on the Convex dashboard
4. Run `npx convex env set SITE_URL=http://localhost:3000`
5. Start the app: `npm run dev`

## Scripts

- `npm run dev` — Vite dev server (port 3000)
- `npm run build` — Production build (Cloudflare Workers target)
- `npm run deploy` — Build + `wrangler deploy`
- `npm run test` — Vitest run
- `npm run lint` — Biome lint
- `npm run check` — Biome lint + format check
- `npx convex dev` — Convex backend dev (separate terminal)
- `npx convex deploy --prod` — Convex production deploy
- `npx tsr generate` — Regenerate route tree (run after adding routes)

## Repository layout

```
convex/                    # Convex backend
├── auth.config.ts         # Better Auth provider config
├── auth.ts                # Better Auth factory + getCurrentUser
├── convex.config.ts       # Component registration
├── http.ts                # Better Auth HTTP route registration
└── schema.ts              # Convex schema (filled in Phase 3)

src/
├── components/ui/         # shadcn components (copied via shadcn CLI)
├── lib/
│   ├── auth-client.ts     # Better Auth React client
│   ├── auth-server.ts     # Server-side auth helpers (getToken, etc.)
│   └── utils.ts           # cn() class merge helper
├── routes/
│   ├── __root.tsx         # Root layout + ConvexBetterAuthProvider
│   ├── index.tsx          # Home placeholder
│   └── api/auth/$.ts      # Better Auth proxy route
└── router.tsx             # Router setup with ConvexQueryClient
```

## Phase status

- [x] Phase 1 — Clone + analyze (PORT-CHECKLIST.md)
- [/] Phase 2 — Foundation (in progress)
  - [x] TanStack Start scaffolded
  - [x] Convex + Better Auth installed and wired
  - [x] shadcn UI primitives added
  - [ ] End-to-end auth roundtrip (register / login / logout) — needs first `convex dev`
- [ ] Phase 3 — Schema port (40 Django models → Convex)
- [ ] Phase 4 — Auth + multi-tenancy (Better Auth org plugin)
- [ ] Phase 5 — Celery → Convex cron
- [ ] Phase 6 — 7 OTA integrations
- [ ] Phase 7 — Resend → SES, Twilio → SNS, Cloudinary → Convex storage
- [ ] Phase 8 — Stripe payments
- [ ] Phase 9 — 30 Next.js routes → TanStack Start
- [ ] Phase 10 — Vitest + Playwright
- [ ] Phase 11 — Deploy (Convex prod + Cloudflare Workers)