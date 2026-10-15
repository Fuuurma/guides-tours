// bookings.list must carry the customer's name on the row itself.
//
// F612: bookings.tsx and dashboard/index.tsx each built a name dictionary
// out of ONE default page of customers.list (20 rows) and rendered anything
// missing from it as "Unknown customer". That map cannot be right — the list
// shows bookings for any customer in the org, so it misses every customer
// outside that page, and it starts being wrong at 21 customers, not 5000.
//
// The fix resolves the name from the row's own customerId, the same way
// _listByScheduleRaw already did for the schedule roster.

import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { batchCustomerNames } from "../bookings";
import schema from "../schema";
import { seedBooking, seedTour } from "./helpers";

const modules = import.meta.glob("../**/*.{ts,tsx}");

type TestCtx = GenericMutationCtx<DataModel>;

const ORG = "org_names";

// Auth seam for bookings.list (same vi.mock("../auth") pattern as
// files_remove_gate.test.ts): requireMembership resolves an admin of ORG.
const { mockState } = vi.hoisted(() => ({
	mockState: { user: null as { _id: string; name: string; email: string } | null },
}));

vi.mock("../auth", () => ({
	authComponent: {
		getAuthUser: async () => mockState.user,
		safeGetAuthUser: async () => mockState.user ?? undefined,
		getAuth: async () => ({
			auth: {
				api: {
					getSession: async () =>
						mockState.user
							? { session: { activeOrganizationId: "org_names" }, user: mockState.user }
							: null,
					listOrganizations: async () => [{ id: "org_names", name: "Org" }],
					listMembers: async () => ({
						members: mockState.user ? [{ userId: mockState.user._id, role: "admin" }] : [],
					}),
				},
			},
			headers: new Headers(),
		}),
	},
	createAuth: (() => ({})) as never,
}));

async function seedCustomer(
	ctx: TestCtx,
	name: string,
	createdAt: number,
): Promise<Id<"customers">> {
	return await ctx.db.insert("customers", {
		organizationId: ORG,
		name,
		email: `${name.toLowerCase()}@example.com`,
		phone: "+15555550100",
		notes: "",
		smsConsent: false,
		emailConsent: true,
		preferredLanguage: "en",
		tags: [],
		source: "",
		sourceDetails: "",
		specialRequirements: "",
		vipStatus: false,
		loyaltyPoints: 0,
		totalVisits: 0,
		totalRevenueCents: 0n,
		createdAt,
		updatedAt: createdAt,
	});
}

describe("bookings.list — batchCustomerNames", () => {
	// The failure the old FE dictionary produced: an org of 30 customers,
	// and a page of bookings for the customers that a 20-row newest-first
	// customers page would NOT contain. Every one of those names has to
	// resolve, because the ids come from the rows being rendered.
	it("resolves names for customers a bounded customers page would miss", async () => {
		const t = convexTest(schema, modules);
		const oldest = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			// 30 customers, strictly increasing creation order.
			for (let i = 0; i < 30; i++) {
				await seedCustomer(c, `Customer ${i}`, i);
			}
			return await seedCustomer(c, "The Oldest", -1);
		});

		const names = await t.run(async (ctx) => {
			const rows = [
				{ customerId: oldest },
				{ customerId: undefined },
			];
			const map = await batchCustomerNames(
				ctx as unknown as QueryCtx,
				rows as { customerId?: Id<"customers"> }[],
			);
			return [...map.entries()].map(([id, name]) => [id, name]);
		});

		expect(names).toEqual([[oldest, "The Oldest"]]);
	});

	it("fetches each customer once no matter how many rows reference it", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run(async (ctx) =>
			seedCustomer(ctx as unknown as TestCtx, "Repeat", 0),
		);
		const size = await t.run(async (ctx) => {
			const rows = Array.from({ length: 25 }, () => ({ customerId: id }));
			const map = await batchCustomerNames(
				ctx as unknown as QueryCtx,
				rows as { customerId?: Id<"customers"> }[],
			);
			return map.size;
		});
		expect(size).toBe(1);
	});

	it("omits ids that resolve to nothing rather than inventing a name", async () => {
		const t = convexTest(schema, modules);
		const { missing, names } = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			const missing = await c.db.insert("customers", {
				organizationId: ORG,
				name: "Temporary",
				email: "temp@example.com",
				phone: "",
				notes: "",
				smsConsent: false,
				emailConsent: true,
				preferredLanguage: "en",
				tags: [],
				source: "",
				sourceDetails: "",
				specialRequirements: "",
				vipStatus: false,
				loyaltyPoints: 0,
				totalVisits: 0,
				totalRevenueCents: 0n,
				createdAt: 0,
				updatedAt: 0,
			});
			const rows = [{ customerId: missing }];
			const map = await batchCustomerNames(
				ctx as unknown as QueryCtx,
				rows as { customerId?: Id<"customers"> }[],
			);
			await c.db.delete(missing);
			return { missing, names: [...map.keys()] };
		});
		expect(names).toEqual([missing]);

		// Second run: the id is gone, so the map is empty. The callers
		// render their own fallback, which is also what a booking with no
		// customerId gets.
		const t2 = convexTest(schema, modules);
		await t2.run(async (ctx) => {
			await seedCustomer(ctx as unknown as TestCtx, "Other", 0);
		});
		const afterDelete = await t2.run(async (ctx) =>
			// biome-ignore lint/suspicious/noExplicitAny: test-local id from a disposed harness
			batchCustomerNames(ctx as unknown as QueryCtx, [
				{ customerId: "v1_stale" as unknown as Id<"customers"> },
			]).then((m) => m.size),
		);
		expect(afterDelete).toBe(0);
	});
});

describe("bookings.list — the name comes off the row, not off another page", () => {
	it("returns each row's own customer name, beyond any 20-row customers page", async () => {
		// Real call through the auth seam (vi.mock("../auth") above). The
		// bookings belong to the oldest customers, the ones a newest-first
		// 20-row customers page would not contain.
		const t = convexTest(schema, modules);
		mockState.user = { _id: "user_names", name: "Admin", email: "a@t.dev" };
		await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			const tourId = await seedTour(c, { orgId: ORG });
			const oldest: Id<"customers">[] = [];
			for (let i = 0; i < 30; i++) {
				const id = await seedCustomer(c, `Customer ${i}`, i);
				if (i < 3) oldest.push(id);
			}
			for (const [i, customerId] of oldest.entries()) {
				await seedBooking(c, {
					orgId: ORG,
					tourId,
					customerId,
					date: `2026-07-1${i}`,
				});
			}
		});
		const result = await t.query(api.bookings.list, {});
		expect(
			result.items.map((b: { customerName: string | null }) => b.customerName).sort(),
		).toEqual(["Customer 0", "Customer 1", "Customer 2"]);
	});

	// Frontend half of F612, kept as a lint-style source rule (like
	// error-display-seam.test.ts): no route may go back to building a
	// name dictionary out of one customers page.
	it("no route rebuilds a customer-name map from a customers page", () => {
		for (const rel of [
			"../../src/routes/dashboard/bookings.tsx",
			"../../src/routes/dashboard/index.tsx",
		]) {
			const src = readFileSync(new URL(rel, import.meta.url), "utf8");
			expect(
				src,
				`${rel} still calls customers.list as a name dictionary`,
			).not.toContain("api.customers.list");
			expect(
				src,
				`${rel} still builds customerNameById`,
			).not.toContain("customerNameById");
		}
	});
});
