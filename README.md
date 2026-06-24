# guides-tours

Tour operator SaaS — destination repo for the canonical codebase after migration.

## Status
- **Stage:** building
- **Migration:** not started — see [migrations/2026-06-deployment-and-convergence.md](../../newProjectsPlanner/migrations/2026-06-deployment-and-convergence.md)

## Source codebases
- **Canonical source:** [Fuuurma/reservations-automation](https://github.com/Fuuurma/reservations-automation) (1.1MB Python + 1.1MB TypeScript, Django 5 + Next.js 16)
- **Dropped:** [Fuuurma/Tour-Management-SaaS](https://github.com/Fuuurma/Tour-Management-SaaS) (Bun.js, smaller, no OTA integrations)

## Stack target
TanStack Start + Convex + Better Auth + Stripe + SES (the standard stack)

## Plan
See `/Users/sergi/Projects/newProjectsPlanner/migrations/2026-06-deployment-and-convergence.md`
for the full ~5-week migration plan.

## Next steps
1. `cd ~/Projects/guides-tours`
2. `npx create-tsrouter-app .` (or similar) to scaffold TanStack Start
3. Install Convex, Better Auth, shadcn, Tailwind v4
4. Port features from reservations-automation
