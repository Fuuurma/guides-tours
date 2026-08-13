// Mock `findOne` for the betterAuth component, used by
// `convex/public_booking.ts` to resolve an organization by slug.
//
// Background: the real `@convex-dev/better-auth` adapter implements
// `findOne` as a Convex query that reads the component's `organization`
// table. In convex-test, the real component is not registered, so the
// syscall would throw "Component "betterAuth" is not registered. Call
// "t.registerComponent"." This mock provides a tiny `findOne` that
// answers organization lookups from a module-scoped in-memory map
// (populated by the test seam in `./index.ts`).
//
// The shape matches the real component's expected input/output:
//   - input:  { model: "organization", where: [{ field: "slug", value }] }
//   - output: { id?: string, _id?: string, name: string, slug: string } | null
//
// TEST-ONLY. The production code path uses the real
// `convex/betterAuth` component, not this file.
import { query } from "./_generated/server.js";
import { v } from "convex/values";

type MockOrg = {
	id?: string;
	_id?: string;
	name: string;
	slug: string;
};

// Module-scoped mock data. The test seam mutates this map directly
// via `seedMockOrg` / `resetMockOrgs` from `./index.ts`. Because
// vitest runs the test file in a single Node process, the same map
// is visible to both the httpAction's `ctx.runQuery` (which calls
// `findOne` here) and the test code.
//
// IMPORTANT: this module is loaded by vitest's moduleCache. If
// vitest's optimizer re-evaluates the module, the state is lost —
// call `seedMockOrg` in `beforeEach` of every test that needs it.
const mockOrgsById = new Map<string, MockOrg>();

export const findOne = query({
	args: {
		model: v.string(),
		where: v.optional(
			v.array(
				v.object({
					field: v.string(),
					value: v.any(),
				}),
			),
		),
	},
	handler: async (_ctx, args) => {
		if (args.model !== "organization") {
			throw new Error(
				`[betterAuthMock] findOne only supports model: "organization"; got "${args.model}"`,
			);
		}
		const whereList = args.where ?? [];
		const slugFilter = whereList.find((w) => w.field === "slug");
		if (!slugFilter) {
			throw new Error(
				'[betterAuthMock] findOne requires a `where: [{ field: "slug", value }]` filter for organization lookups',
			);
		}
		for (const org of mockOrgsById.values()) {
			if (org.slug === slugFilter.value) {
				return org;
			}
		}
		return null;
	},
});

// Re-exported for unit tests that want to populate the store
// without going through the test seam in ./index.ts. Prefer
// `seedMockOrg` from the test seam.
export function _seedMockOrgDirect(org: MockOrg): void {
	const key = org.id ?? org._id;
	if (!key) throw new Error("[betterAuthMock] organization requires id or _id");
	mockOrgsById.set(key, org);
}

export function _resetMockOrgsDirect(): void {
	mockOrgsById.clear();
}

// Exposed for the test seam in ./index.ts so the seam and the
// query handler share the same module instance (vitest's module
// loader is per-glob, so duplicating the Map between two files
// would lose writes).
export { mockOrgsById as _mockOrgsById };
