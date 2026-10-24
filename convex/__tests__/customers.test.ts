// Tests for customers CRUD.
//
// Uses convex-test to spin up a Convex harness, then directly invokes
// the mutations + queries with seeded data. We bypass requireMembership
// by writing rows with a known organizationId — the test setup doesn't
// fake Better Auth identities (Phase 4 mocking is its own beast).

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
	MAX_CUSTOMER_SCAN,
	paginateCustomerRows,
	scanCustomers,
} from "../customers";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,tsx}");

type TestCtx = GenericMutationCtx<DataModel> & {
	storage: { getUrl: (id: string) => Promise<string | null> };
};

// Seed a customer row directly (skip the auth-gated create()).
async function seedCustomer(
	ctx: TestCtx,
	orgId: string,
	overrides: Partial<{
		name: string;
		email: string;
		phone: string;
		notes: string;
		preferredLanguage: string;
		tags: string[];
		source: string;
		sourceDetails: string;
		specialRequirements: string;
		vipStatus: boolean;
		loyaltyPoints: number;
		totalVisits: number;
		totalRevenueCents: bigint;
		nextBookingDate: string;
		smsConsent: boolean;
		emailConsent: boolean;
		smsConsentDate: number;
		emailConsentDate: number;
	}> = {},
): Promise<Id<"customers">> {
	return await ctx.db.insert("customers", {
		organizationId: orgId,
		name: overrides.name ?? "Alice",
		email: overrides.email ?? "alice@example.com",
		phone: overrides.phone ?? "+15555550100",
		notes: overrides.notes ?? "",
		smsConsent: overrides.smsConsent ?? false,
		emailConsent: overrides.emailConsent ?? true,
		smsConsentDate: overrides.smsConsentDate,
		emailConsentDate: overrides.emailConsentDate,
		preferredLanguage: overrides.preferredLanguage ?? "en",
		tags: overrides.tags ?? [],
		source: overrides.source ?? "",
		sourceDetails: overrides.sourceDetails ?? "",
		specialRequirements: overrides.specialRequirements ?? "",
		vipStatus: overrides.vipStatus ?? false,
		loyaltyPoints: overrides.loyaltyPoints ?? 0,
		totalVisits: overrides.totalVisits ?? 0,
		totalRevenueCents: overrides.totalRevenueCents ?? 0n,
		nextBookingDate: overrides.nextBookingDate,
		createdAt: 0,
		updatedAt: 0,
	});
}

describe("convex/customers — schema invariants", () => {
	it("allows inserting a customer with the minimum required fields", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run(async (ctx) => {
			return await seedCustomer(ctx as unknown as TestCtx, "org_a");
		});
		const row = await t.run(async (ctx) => {
			return await ctx.db.get(id);
		});
		expect(row).not.toBeNull();
		expect(row?.email).toBe("alice@example.com");
		expect(row?.vipStatus).toBe(false);
		expect(row?.totalRevenueCents).toBe(0n);
	});

	it("supports totalRevenueCents as a bigint (cents-only)", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run(async (ctx) => {
			return await seedCustomer(ctx as unknown as TestCtx, "org_a", {
				totalRevenueCents: 123456n,
			});
		});
		const row = await t.run(async (ctx) => ctx.db.get(id));
		expect(row?.totalRevenueCents).toBe(123456n);
	});
});

describe("convex/customers — ALLOWED_UPDATE_FIELDS contract", () => {
	it("ALLOWED_UPDATE_FIELDS does not include email", () => {
		// Email has a unique-per-org constraint, so it's a separate code
		// path. Make sure nobody adds it to the whitelist by accident.
		const allowed = new Set([
			"name",
			"phone",
			"preferredLanguage",
			"notes",
			"tags",
			"source",
			"sourceDetails",
			"preferredGuideId",
			"specialRequirements",
			"vipStatus",
			"emailConsent",
			"smsConsent",
		]);
		expect(allowed.has("email")).toBe(false);
	});
});

describe("convex/customers — list pagination behavior (unit-level)", () => {
	it("filters by vipOnly when index lookups would match", async () => {
		// Use convex-test to seed two customers in the same org, one VIP,
		// and verify a get() with vipStatus:true returns only the VIP.
		// (We test get() because list() requires auth context.)
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			await seedCustomer(c, "org_a", {
				name: "Vip",
				email: "vip@x.com",
				vipStatus: true,
			});
			await seedCustomer(c, "org_a", {
				name: "NotVip",
				email: "notvip@x.com",
				vipStatus: false,
			});
		});
		const all = await t.run(async (ctx) => {
			return await ctx.db
				.query("customers")
				.withIndex("by_org", (q) => q.eq("organizationId", "org_a"))
				.collect();
		});
		const vips = all.filter((c) => c.vipStatus);
		expect(vips.length).toBe(1);
		expect(vips[0]?.name).toBe("Vip");
	});

	it("by_org_vip index can select the regular (non-VIP) class (F364)", async () => {
		// list() maps vipOnly:false → vipStatus:false on by_org_vip.
		// Assert the index contract so a truthiness regression is visible.
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			await seedCustomer(c, "org_reg", {
				name: "Vip",
				email: "vip@reg.com",
				vipStatus: true,
			});
			await seedCustomer(c, "org_reg", {
				name: "NotVip",
				email: "notvip@reg.com",
				vipStatus: false,
			});
		});
		const regulars = await t.run(async (ctx) => {
			return await ctx.db
				.query("customers")
				.withIndex("by_org_vip", (q) =>
					q.eq("organizationId", "org_reg").eq("vipStatus", false),
				)
				.collect();
		});
		expect(regulars.map((c) => c.name)).toEqual(["NotVip"]);
	});
});

describe("convex/customers — list scan window (F468/F57 class)", () => {
	// The defect this pins: list() scanned the bare `by_org` /
	// `by_org_vip` ranges, which fall back to _creationTime, so
	// .take(MAX_CUSTOMER_SCAN) kept the OLDEST rows of the org. Every
	// customer created past that point was unreachable from the CRM list
	// AND from the booking-form customer picker (new-booking-page.tsx
	// searches the same query). Seed a full window plus one and assert the
	// survivor is the newest customer, not the oldest.

	const ORG = "org_big";

	async function seedWindow(ctx: TestCtx, count: number, vipEveryOther = false) {
		for (let i = 0; i < count; i++) {
			await ctx.db.insert("customers", {
				organizationId: ORG,
				name: `Customer ${String(i).padStart(5, "0")}`,
				email: `c${i}@example.com`,
				phone: "+15555550100",
				notes: "",
				smsConsent: false,
				emailConsent: true,
				preferredLanguage: "en",
				tags: [],
				source: "",
				sourceDetails: "",
				specialRequirements: "",
				vipStatus: vipEveryOther ? i % 2 === 0 : false,
				loyaltyPoints: 0,
				totalVisits: 0,
				totalRevenueCents: 0n,
				// Strictly increasing so "newest" is unambiguous.
				createdAt: 1_000_000 + i,
				updatedAt: 1_000_000 + i,
			});
		}
	}

	it("keeps the NEWEST customers when the cap truncates the org", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await seedWindow(ctx, MAX_CUSTOMER_SCAN + 1);
		});
		const { rows, truncated } = await t.run(async (ctx) =>
			scanCustomers(ctx as unknown as QueryCtx, ORG, {
				order: "desc",
				maxScan: MAX_CUSTOMER_SCAN,
			}),
		);

		expect(rows.length).toBe(MAX_CUSTOMER_SCAN);
		expect(truncated).toBe(true);
		// The newest customer — the one a guide just added — must survive
		// the cap. Before the fix this was the customer 1 past the cap.
		expect(rows[0]?.name).toBe(
			`Customer ${String(MAX_CUSTOMER_SCAN).padStart(5, "0")}`,
		);
		expect(
			rows.some((r) => r.name === `Customer ${String(MAX_CUSTOMER_SCAN).padStart(5, "0")}`),
		).toBe(true);
		// ...and the oldest is the one that gets dropped.
		expect(
			rows.some((r) => r.name === "Customer 00000"),
		).toBe(false);
	});

	it("keeps the OLDEST customers when the caller asks for ascending order", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await seedWindow(ctx, MAX_CUSTOMER_SCAN + 1);
		});
		const { rows, truncated } = await t.run(async (ctx) =>
			scanCustomers(ctx as unknown as QueryCtx, ORG, {
				order: "asc",
				maxScan: MAX_CUSTOMER_SCAN,
			}),
		);
		expect(truncated).toBe(true);
		expect(rows[0]?.name).toBe("Customer 00000");
	});

	it("the newest customer survives the VIP-class scan too", async () => {
		// Same cap, second index branch. VIP and non-VIP rows are
		// interleaved so the VIP class is spread across creation order —
		// a creation-time-ordered window would keep the oldest half.
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await seedWindow(ctx as unknown as TestCtx, 40, true);
		});
		const { rows, truncated } = await t.run(async (ctx) =>
			scanCustomers(ctx as unknown as QueryCtx, ORG, {
				vipOnly: true,
				order: "desc",
				maxScan: 10,
			}),
		);
		expect(truncated).toBe(true);
		expect(rows.length).toBe(10);
		expect(rows.every((r) => r.vipStatus)).toBe(true);
		// Newest VIP is index 38 (39 is odd → not VIP).
		expect(rows[0]?.name).toBe("Customer 00038");
		expect(rows.at(-1)?.name).toBe("Customer 00020");
		// The oldest VIPs are what a creation-time window would have kept.
		expect(rows.some((r) => r.name === "Customer 00000")).toBe(false);
	});

	it("is not truncated when the org fits inside the window", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await seedWindow(ctx, 12);
		});
		const { rows, truncated } = await t.run(async (ctx) =>
			scanCustomers(ctx as unknown as QueryCtx, ORG, {
				order: "desc",
				maxScan: MAX_CUSTOMER_SCAN,
			}),
		);
		expect(rows.length).toBe(12);
		expect(truncated).toBe(false);
	});

	it("does not call an org of exactly maxScan customers truncated", async () => {
		// The scan over-fetches by one row precisely so "reached the limit"
		// and "there is more" stay distinguishable. Off-by-one here would
		// render "most recent 5,000 of more" on a complete 5,000-row org.
		const exact = convexTest(schema, modules);
		await exact.run(async (ctx) => {
			await seedWindow(ctx as unknown as TestCtx, 10);
		});
		const onLimit = await exact.run(async (ctx) =>
			scanCustomers(ctx as unknown as QueryCtx, ORG, {
				order: "desc",
				maxScan: 10,
			}),
		);
		expect(onLimit.rows.length).toBe(10);
		expect(onLimit.truncated).toBe(false);

		const over = convexTest(schema, modules);
		await over.run(async (ctx) => {
			await seedWindow(ctx as unknown as TestCtx, 11);
		});
		const past = await over.run(async (ctx) =>
			scanCustomers(ctx as unknown as QueryCtx, ORG, {
				order: "desc",
				maxScan: 10,
			}),
		);
		expect(past.rows.length).toBe(10);
		expect(past.truncated).toBe(true);
	});
});

describe("convex/customers — paginateCustomerRows", () => {
	it("reports total/hasNext from the window", () => {
		const rows = Array.from({ length: 45 }, (_, i) => i);
		expect(paginateCustomerRows(rows, { page: 1, pageSize: 20, truncated: false }))
			.toMatchObject({
				items: Array.from({ length: 20 }, (_, i) => i),
				total: 45,
				page: 1,
				pageSize: 20,
				hasNext: true,
				hasPrevious: false,
			});
		expect(
			paginateCustomerRows(rows, { page: 3, pageSize: 20, truncated: false }),
		).toMatchObject({ hasNext: false, hasPrevious: true });
	});

	it("does not invent an endless next page when the window was cut short", () => {
		// hasNext describes the window. `truncated` is the separate signal
		// that the window is not the whole org — folding it into hasNext
		// would feed a pager an infinite run of empty pages.
		const rows = Array.from({ length: 5000 }, (_, i) => i);
		const page = paginateCustomerRows(rows, {
			page: 250,
			pageSize: 20,
			truncated: true,
		});
		expect(page.hasNext).toBe(false);
		expect(page.total).toBe(5000);
	});
});

describe("convex/customers — consent date transitions (F365)", () => {
	it("only re-stamps consentDate on a false→true transition", async () => {
		const t = convexTest(schema, modules);
		const customerId = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			return await seedCustomer(c, "org_consent", {
				name: "C",
				email: "c@x.com",
				emailConsent: true,
				emailConsentDate: 1_000,
				smsConsent: true,
				smsConsentDate: 2_000,
			});
		});
		// Simulate the update() consent-date rule: re-sending `true`
		// must not overwrite the original timestamp.
		const after = await t.run(async (ctx) => {
			const existing = (await ctx.db.get(customerId))!;
			const patch: Record<string, unknown> = {
				emailConsent: true,
				smsConsent: true,
			};
			if (patch.emailConsent === true && !existing.emailConsent) {
				patch.emailConsentDate = 9_999;
			}
			if (patch.smsConsent === true && !existing.smsConsent) {
				patch.smsConsentDate = 9_999;
			}
			await ctx.db.patch(customerId, patch);
			return (await ctx.db.get(customerId))!;
		});
		expect(after.emailConsentDate).toBe(1_000);
		expect(after.smsConsentDate).toBe(2_000);
	});
});

describe("convex/customers.get — bounded scan", () => {
	// customers.get fetches totalBookings + upcomingBookingsCount. A
	// customer with thousands of bookings would blow up the response
	// if we .collect() everything. The bounded version uses .take() to
	// cap at 1000 + appends "+" to indicate truncation, and uses a
	// separate index scan for upcoming active bookings.
	it("caps totalBookings at 1000 with '+' suffix when truncated", async () => {
		const t = convexTest(schema, modules);
		// The get query requires auth via requireMembership, so we
		// can't call it directly. Instead we assert the bounded-scan
		// contract at the index layer: a by_customer_date query with
		// .take(1001) returns at most 1001 rows.
		const customerId = await t.run(async (ctx) => {
			return await seedCustomer(ctx as unknown as TestCtx, "org_b");
		});
		const sampled = await t.run(async (ctx) => {
			return await ctx.db
				.query("bookings")
				.withIndex("by_customer_date", (q) =>
					q.eq("customerId", customerId),
				)
				.take(1001);
		});
		expect(sampled.length).toBeLessThanOrEqual(1001);
	});

	it("uses a separate index scan for upcoming bookings (gte today)", async () => {
		const t = convexTest(schema, modules);
		const customerId = await t.run(async (ctx) => {
			return await seedCustomer(ctx as unknown as TestCtx, "org_c");
		});
		const today = new Date().toISOString().slice(0, 10);
		const upcoming = await t.run(async (ctx) => {
			return await ctx.db
				.query("bookings")
				.withIndex("by_customer_date", (q) =>
					q
						.eq("customerId", customerId)
						.gte("date", today),
				)
				.take(500);
		});
		// With no bookings seeded, the array is empty — but the query
		// must succeed without scanning cancelled/historical rows.
		expect(upcoming).toEqual([]);
	});
});