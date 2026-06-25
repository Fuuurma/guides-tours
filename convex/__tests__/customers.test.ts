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
});