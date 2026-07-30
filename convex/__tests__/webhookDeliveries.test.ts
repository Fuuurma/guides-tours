// Tests for the webhook delivery tracking logic in
// convex/webhookDeliveries.ts.
//
// Coverage:
//   - recordDelivery: creates a new delivery record with the expected
//     fields and "received" status
//   - recordDelivery: idempotent on (source, eventId) — returns the
//     existing row's id with isDuplicate:true on a second call
//   - recordDelivery: creates separate records for different eventIds
//     from the same source
//   - updateDeliveryStatus: updates the status of an existing delivery
//     (and sets processedAt for terminal statuses)
//   - updateDeliveryStatus: throws ConvexError when no delivery matches
//     the (source, eventId) pair
//   - listByOrg: returns deliveries scoped to a specific organization,
//     newest first
//   - listByOrg: returns an empty array for an org with no deliveries
//   - listRecent: returns the most recent deliveries (up to the limit)
//     for the active org, ordered by receivedAt desc
//   - listRecent: excludes deliveries beyond the limit (older ones)
//
// recordDelivery / updateDeliveryStatus / listByOrg are internal
// mutations/queries and are invoked directly. listRecent is a public
// query gated by requireMembership (Better Auth); convexTest doesn't
// fake the Better Auth session flow, so we exercise the same
// by_org_received index + .order("desc").take(limit) pipeline that
// listRecent uses via t.run (following the pattern in
// customers.test.ts and bookings.test.ts).

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

describe("webhookDeliveries.recordDelivery", () => {
	it("creates a new delivery record with source, eventId, organizationId, event, and status", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_wd_create";
		const result = await t.mutation(internal.webhookDeliveries.recordDelivery, {
			organizationId: orgId,
			source: "stripe",
			eventId: "evt_001",
			eventType: "payment_intent.succeeded",
			payload: { id: "evt_001", amount: 1000 },
			ipAddress: "127.0.0.1",
			userAgent: "Stripe/1.0",
			attemptCount: 1,
		});
		expect(result.isDuplicate).toBe(false);
		expect(result.id).toBeDefined();

		const row = (await t.run((ctx) => ctx.db.get(result.id))) as any;
		expect(row).not.toBeNull();
		expect(row.organizationId).toBe(orgId);
		expect(row.source).toBe("stripe");
		expect(row.eventId).toBe("evt_001");
		expect(row.eventType).toBe("payment_intent.succeeded");
		expect(row.status).toBe("received");
		expect(row.ipAddress).toBe("127.0.0.1");
		expect(row.userAgent).toBe("Stripe/1.0");
		expect(row.attemptCount).toBe(1);
		expect(row.payload).toEqual({ id: "evt_001", amount: 1000 });
		expect(row.receivedAt).toBeGreaterThan(0);
		expect(row.processedAt).toBeUndefined();
	});

	it("returns existing delivery (idempotent) when called with the same (source, eventId) pair", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_wd_idem";
		const first = await t.mutation(internal.webhookDeliveries.recordDelivery, {
			organizationId: orgId,
			source: "viator",
			eventId: "evt_dup_001",
			eventType: "booking.created",
			payload: { ref: "R1" },
		});
		expect(first.isDuplicate).toBe(false);

		const second = await t.mutation(internal.webhookDeliveries.recordDelivery, {
			organizationId: orgId,
			source: "viator",
			eventId: "evt_dup_001",
			eventType: "booking.created",
			payload: { ref: "R1-different" },
		});
		expect(second.isDuplicate).toBe(true);
		expect(second.id).toBe(first.id);

		// The existing row must NOT be modified — payload stays as the
		// first insert, status stays "received".
		const row = (await t.run((ctx) => ctx.db.get(first.id))) as any;
		expect(row.payload).toEqual({ ref: "R1" });
		expect(row.status).toBe("received");
	});

	it("creates separate records for different eventIds from the same source", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_wd_multi";
		const a = await t.mutation(internal.webhookDeliveries.recordDelivery, {
			organizationId: orgId,
			source: "getyourguide",
			eventId: "evt_A",
			eventType: "booking.created",
			payload: {},
		});
		const b = await t.mutation(internal.webhookDeliveries.recordDelivery, {
			organizationId: orgId,
			source: "getyourguide",
			eventId: "evt_B",
			eventType: "booking.cancelled",
			payload: {},
		});
		expect(a.isDuplicate).toBe(false);
		expect(b.isDuplicate).toBe(false);
		expect(a.id).not.toBe(b.id);

		const rows = await t.run((ctx) =>
			ctx.db
				.query("webhookDeliveries")
				.withIndex("by_source_event", (q) => q.eq("source", "getyourguide"))
				.collect(),
		);
		expect(rows.length).toBe(2);
		const ids = rows.map((r) => r.eventId).sort();
		expect(ids).toEqual(["evt_A", "evt_B"]);
	});
});

describe("webhookDeliveries.updateDeliveryStatus", () => {
	it("updates the status of an existing delivery", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_wd_update";
		const { id } = await t.mutation(internal.webhookDeliveries.recordDelivery, {
			organizationId: orgId,
			source: "stripe",
			eventId: "evt_upd_001",
			eventType: "charge.refunded",
			payload: {},
		});
		const updatedId = await t.mutation(
			internal.webhookDeliveries.updateDeliveryStatus,
			{
				source: "stripe",
				eventId: "evt_upd_001",
				status: "processed",
				processedResourceId: "ch_123",
			},
		);
		expect(updatedId).toBe(id);

		const row = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(row.status).toBe("processed");
		expect(row.processedResourceId).toBe("ch_123");
		// "processed" is a terminal status → processedAt is set.
		expect(row.processedAt).toBeGreaterThan(0);
	});

	it("sets processedAt for failed status", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_wd_fail";
		const { id } = await t.mutation(internal.webhookDeliveries.recordDelivery, {
			organizationId: orgId,
			source: "viator",
			eventId: "evt_fail_001",
			eventType: "booking.created",
			payload: {},
		});
		await t.mutation(internal.webhookDeliveries.updateDeliveryStatus, {
			source: "viator",
			eventId: "evt_fail_001",
			status: "failed",
			errorMessage: "boom",
		});
		const row = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(row.status).toBe("failed");
		expect(row.errorMessage).toBe("boom");
		expect(row.processedAt).toBeGreaterThan(0);
	});

	it("sets skipReason for skipped status without processedAt", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_wd_skip";
		const { id } = await t.mutation(internal.webhookDeliveries.recordDelivery, {
			organizationId: orgId,
			source: "viator",
			eventId: "evt_skip_001",
			eventType: "booking.created",
			payload: {},
		});
		await t.mutation(internal.webhookDeliveries.updateDeliveryStatus, {
			source: "viator",
			eventId: "evt_skip_001",
			status: "skipped",
			skipReason: "skipped: duplicate eventId",
		});
		const row = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(row.status).toBe("skipped");
		expect(row.skipReason).toBe("skipped: duplicate eventId");
		// "skipped" is not terminal → processedAt stays unset.
		expect(row.processedAt).toBeUndefined();
	});

	it("throws when delivery not found", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(internal.webhookDeliveries.updateDeliveryStatus, {
				source: "stripe",
				eventId: "evt_missing_999",
				status: "processed",
			}),
		).rejects.toThrow(/No webhook delivery found/);
	});
});

describe("webhookDeliveries.listByOrg", () => {
	it("returns deliveries for a specific organization", async () => {
		const t = convexTest(schema, modules);
		const orgA = "org_wd_list_a";
		const orgB = "org_wd_list_b";
		// Seed deliveries in two orgs.
		await t.mutation(internal.webhookDeliveries.recordDelivery, {
			organizationId: orgA,
			source: "stripe",
			eventId: "evt_a_1",
			eventType: "payment_intent.succeeded",
			payload: {},
		});
		await t.mutation(internal.webhookDeliveries.recordDelivery, {
			organizationId: orgA,
			source: "viator",
			eventId: "evt_a_2",
			eventType: "booking.created",
			payload: {},
		});
		await t.mutation(internal.webhookDeliveries.recordDelivery, {
			organizationId: orgB,
			source: "stripe",
			eventId: "evt_b_1",
			eventType: "payment_intent.succeeded",
			payload: {},
		});

		const rows = await t.query(internal.webhookDeliveries.listByOrg, {
			organizationId: orgA,
		});
		expect(rows.length).toBe(2);
		// All rows belong to orgA.
		for (const r of rows) {
			expect(r.organizationId).toBe(orgA);
		}
		// Ordered newest-first (by receivedAt desc).
		expect(rows[0]!.receivedAt).toBeGreaterThanOrEqual(rows[1]!.receivedAt);
	});

	it("returns empty array for org with no deliveries", async () => {
		const t = convexTest(schema, modules);
		const rows = await t.query(internal.webhookDeliveries.listByOrg, {
			organizationId: "org_wd_empty",
		});
		expect(rows).toEqual([]);
	});

	it("filters by status when provided", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_wd_filter";
		await t.mutation(internal.webhookDeliveries.recordDelivery, {
			organizationId: orgId,
			source: "stripe",
			eventId: "evt_f_1",
			eventType: "payment_intent.succeeded",
			payload: {},
		});
		await t.mutation(internal.webhookDeliveries.recordDelivery, {
			organizationId: orgId,
			source: "stripe",
			eventId: "evt_f_2",
			eventType: "payment_intent.payment_failed",
			payload: {},
		});
		// Mark one as processed.
		await t.mutation(internal.webhookDeliveries.updateDeliveryStatus, {
			source: "stripe",
			eventId: "evt_f_1",
			status: "processed",
		});

		const processed = await t.query(internal.webhookDeliveries.listByOrg, {
			organizationId: orgId,
			status: "processed",
		});
		expect(processed.length).toBe(1);
		expect(processed[0]!.eventId).toBe("evt_f_1");
		expect(processed[0]!.status).toBe("processed");

		const received = await t.query(internal.webhookDeliveries.listByOrg, {
			organizationId: orgId,
			status: "received",
		});
		expect(received.length).toBe(1);
		expect(received[0]!.eventId).toBe("evt_f_2");
	});
});

describe("webhookDeliveries.listRecent", () => {
	// listRecent is a public query gated by requireMembership (Better
	// Auth). convexTest doesn't fake the Better Auth session flow, so
	// we exercise the same by_org_received index + .order("desc")
	// .take(limit) pipeline that listRecent uses internally. This
	// validates the data-retrieval contract (newest-first, capped at
	// the limit) that the query delegates to. See customers.test.ts
	// and bookings.test.ts for the same bypass pattern.

	it("returns recent deliveries (up to the limit) ordered by receivedAt desc", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_wd_recent";
		// Seed 3 deliveries with increasing receivedAt.
		const ids: string[] = [];
		for (let i = 0; i < 3; i++) {
			const { id } = await t.mutation(
				internal.webhookDeliveries.recordDelivery,
				{
					organizationId: orgId,
					source: "stripe",
					eventId: `evt_r_${i}`,
					eventType: "payment_intent.succeeded",
					payload: {},
				},
			);
			ids.push(id);
		}

		// Mirror listRecent's non-source branch: by_org_received, desc, take(limit).
		const rows = await t.run((ctx) =>
			ctx.db
				.query("webhookDeliveries")
				.withIndex("by_org_received", (q) => q.eq("organizationId", orgId))
				.order("desc")
				.take(40),
		);
		expect(rows.length).toBe(3);
		// Newest-first: receivedAt is non-decreasing as we go down.
		expect(rows[0]!.receivedAt).toBeGreaterThanOrEqual(rows[1]!.receivedAt);
		expect(rows[1]!.receivedAt).toBeGreaterThanOrEqual(rows[2]!.receivedAt);
	});

	it("excludes deliveries beyond the limit (older ones)", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_wd_limit";
		// Seed 5 deliveries with strictly increasing receivedAt so the
		// desc ordering is deterministic (recordDelivery uses Date.now()
		// which can collide within the same ms).
		await t.run(async (ctx) => {
			for (let i = 0; i < 5; i++) {
				await ctx.db.insert("webhookDeliveries", {
					organizationId: orgId,
					source: "stripe",
					eventId: `evt_l_${i}`,
					eventType: "payment_intent.succeeded",
					status: "received",
					payload: {},
					attemptCount: 1,
					receivedAt: 1000 + i,
				});
			}
		});

		// listRecent caps at min(limit ?? 40, 100). Use limit=2 to
		// mirror the "time window" exclusion: only the 2 newest survive.
		const rows = await t.run((ctx) =>
			ctx.db
				.query("webhookDeliveries")
				.withIndex("by_org_received", (q) => q.eq("organizationId", orgId))
				.order("desc")
				.take(2),
		);
		expect(rows.length).toBe(2);
		// The 2 newest by receivedAt (1004, 1003).
		expect(rows[0]!.receivedAt).toBe(1004);
		expect(rows[1]!.receivedAt).toBe(1003);

		// The 3 older deliveries (1002, 1001, 1000) are excluded.
		const all = await t.run((ctx) =>
			ctx.db
				.query("webhookDeliveries")
				.withIndex("by_org_received", (q) => q.eq("organizationId", orgId))
				.collect(),
		);
		expect(all.length).toBe(5);
		const oldestReturned = rows[rows.length - 1]!.receivedAt;
		const excluded = all.filter((r) => r.receivedAt < oldestReturned);
		expect(excluded.length).toBe(3);
	});
});
