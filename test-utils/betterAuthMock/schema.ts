/**
 * Schema for the betterAuth mock component. The real
 * `convex/betterAuth` component carries a full user/session/account/
 * verification/organization/member/invitation/jwks schema; this
 * mock only needs to satisfy `t.registerComponent` (which requires a
 * non-empty `defineSchema` payload). The mock's `findOne` reads
 * from a module-scoped in-memory map populated by `seedMockOrg`,
 * so this schema is intentionally empty.
 *
 * TEST-ONLY.
 */
import { defineSchema } from "convex/server";

export default defineSchema({});
