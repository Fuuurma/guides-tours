// Schema for the locally-installed Better Auth component.
//
// Source of truth is `generatedSchema.ts` (regenerated with
// `cd convex/betterAuth && npx auth generate --output ./generatedSchema.ts`).
// This file is the public entry point — it imports the generated tables
// and adds any custom indexes. Don't edit `generatedSchema.ts` directly;
// regenerate it after changing the auth config in `convex/auth.ts`.

import { defineSchema } from "convex/server";
import { tables } from "./generatedSchema";

const schema = defineSchema(tables);

export default schema;