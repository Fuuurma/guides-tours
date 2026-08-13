// Test seam for the real `betterAuth` Convex component.
//
// `registerBetterAuthMock(t)` wires up `t.registerComponent("betterAuth", …)`
// so the public-booking httpAction tests can exercise the real
// `createForSlug` action end-to-end (including cross-tenant hostile
// tourId / scheduleId payloads) without the live
// @convex-dev/better-auth component.
//
// The mock's `findOne` reads from a module-scoped in-memory map
// (populated by `seedMockOrg` from this same file). The same map
// is cleared by `resetMockOrgs()` between tests to avoid
// cross-test leakage.
//
// TEST-ONLY. The production code path uses the real
// `convex/betterAuth` component, not this file.
import type { TestConvex } from "convex-test";
import mockSchema from "./schema";
import { _mockOrgsById } from "./adapter";

const betterAuthMockModules = import.meta.glob("./**/*.{ts,tsx}");

/** Clears the mock org store. Call in `beforeEach`. */
export function resetMockOrgs(): void {
	_mockOrgsById.clear();
}

/** Inserts (or overwrites) a mock org by id. */
export function seedMockOrg(opts: {
	id: string;
	slug: string;
	name?: string;
	idField?: "id" | "_id";
}): { id: string; name: string; slug: string } {
	const org = {
		...(opts.idField === "_id" ? { _id: opts.id } : { id: opts.id }),
		slug: opts.slug,
		name: opts.name ?? `Mock org ${opts.id}`,
	};
	_mockOrgsById.set(opts.id, org);
	return { id: opts.id, name: org.name, slug: org.slug };
}

/**
 * Registers a stub `betterAuth` component with the test runner so
 * `ctx.runQuery(components.betterAuth.adapter.findOne, …)` resolves
 * to the mock defined in `./adapter.ts`.
 */
export function registerBetterAuthMock(t: TestConvex<any>): void {
	t.registerComponent("betterAuth", mockSchema, betterAuthMockModules);
}
