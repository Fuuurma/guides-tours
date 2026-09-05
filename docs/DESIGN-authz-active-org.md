# Design — authz active-org resolution (closing the first-org fallback)

Date: 2026-09-05 · Author: fleet shift (GLM 5.3 Flash) · Status: awaiting owner pick
Context: `convex/lib/authz.ts:56` `getActiveMembership` — flagged cross-tenant P1
(devin roam 09-04, hub queue guides-tours).

## The situation

`getActiveMembership` reads `session.activeOrganizationId` (Better Auth org
plugin). When unset it silently falls back to `list[0]` — the user's first
org — logging a console warning. Grep of `src/` shows the client NEVER calls
`setActiveOrganization`, so for a multi-org user every request operates on
`list[0]` regardless of intent. Fail-closes correctly on: no orgs at all, and
data inconsistency (org without member row).

Is multi-org even real here? PRODUCT/docs never mention org switching; there
is no org-picker UI. Today a user has exactly one org in practice — which is
why the fallback has been harmless so far.

## Options

**A — Pin at session creation (recommended).**
After login/onboarding, the client calls `authClient.setActiveOrganization`
with the user's single org (or the org the user picked). Backend unchanged —
fallback stays as belt-and-braces for legacy sessions, warn stays on.
Smallest diff, no behavior change for single-org users, multi-org users get
a deterministic org instead of `list[0]`.
Slice: one call in the post-login/onboarding client path + a post-login
check that surfaces a picker when `listOrganizations().length > 1`.

**B — Fail closed on multi-org without active org.**
`getActiveMembership` throws when `list.length > 1 && !activeOrgId`. Safest
tenancy story; but there is no org-picker UI to unblock the user, so this
is a support incident generator until Option A's picker exists. Do B only
if owner says multi-org users are (or will soon be) real.

**C — Remove the fallback entirely (always require activeOrganizationId).**
Cleanest model; breaks every legacy session at deploy. Not recommended
unless the owner wants a hard cutover.

## Recommendation

A now, B later if multi-org becomes a real product scenario:
1. Client: set active org post-login/onboarding (single org → automatic).
2. Client: if `listOrganizations().length > 1` and no active org → picker
   before entering the dashboard.
3. Backend: unchanged; keep the warn as the ops signal that (1)/(2) missed
   someone. The warn line already carries userId + defaulted org id.

Owner decision needed only for the picker's copy/placement (step 2) —
step 1 is unambiguous.
