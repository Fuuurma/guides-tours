// Static auth export used by the Better Auth CLI to generate the schema for
// the locally-installed component (convex/betterAuth). Do not import this
// file at runtime — it triggers errors from Better Auth due to missing
// environment variable access.
//
// Regenerate the schema with:
//   cd convex/betterAuth && npx auth generate

import { createAuth } from "../auth";

export const auth = createAuth({} as Parameters<typeof createAuth>[0]);