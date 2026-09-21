// Tests for the stripeEvents dedupe gate (convex/stripeEvents.ts).
//
// The Stripe webhook httpAction claims each evt_* id through
// `claim` before dispatching and marks the outcome via `settle`.
// These tests pin the claim/reclaim semantics:
//   - first delivery claims the event
//   - a processed event is a hard duplicate
//   - a failed event is reclaimable (Stripe retry re-drives delivery)
//   - a fresh "processing" row dedupes; a stale one is reclaimed
//   - dedupe is per-org (same eventId across orgs both process)
//   - settle never reopens a processed event

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function getRow(t: ReturnType<typeof convexTest>, orgId: string, eventId: string) {
	return await t.run(async (ctx: any) => {
		return await ctx.db
			.query("stripeEvents")
			.withIndex("by_org_event", (q: any) =>
				q.eq("organizationId", orgId).eq("eventId", eventId),
			)
			.first();
	});
}

describe("stripeEvents claim/settle", () => {
	it("first delivery claims; second claim after processed is duplicate", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_se_1";
		const first = await t.mutation(internal.stripeEvents.claim, {
			organizationId: orgId,
			eventId: "evt_1",
			eventType: "payment_intent.succeeded",
		});
		expect(first).toBe("claimed");
		await t.mutation(internal.stripeEvents.settle, {
			organizationId: orgId,
			eventId: "evt_1",
			status: "processed",
		});
		const second = await t.mutation(internal.stripeEvents.claim, {
			organizationId: orgId,
			eventId: "evt_1",
			eventType: "payment_intent.succeeded",
		});
		expect(second).toBe("duplicate");
	});

	it("failed event is reclaimable on retry", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_se_2";
		await t.mutation(internal.stripeEvents.claim, {
			organizationId: orgId,
			eventId: "evt_2",
			eventType: "charge.refunded",
		});
		await t.mutation(internal.stripeEvents.settle, {
			organizationId: orgId,
			eventId: "evt_2",
			status: "failed",
			errorMessage: "boom",
		});
		// Stripe retry → claimed again, attemptCount bumped.
		const retry = await t.mutation(internal.stripeEvents.claim, {
			organizationId: orgId,
			eventId: "evt_2",
			eventType: "charge.refunded",
		});
		expect(retry).toBe("claimed");
		const row = await getRow(t, orgId, "evt_2");
		expect(row?.status).toBe("processing");
		expect(row?.attemptCount).toBe(2);
		expect(row?.errorMessage).toBeUndefined();
	});

	it("fresh processing row dedupes (concurrent delivery)", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_se_3";
		await t.mutation(internal.stripeEvents.claim, {
			organizationId: orgId,
			eventId: "evt_3",
			eventType: "payment_intent.succeeded",
		});
		// No settle yet — a second delivery while still processing is a dup.
		const dup = await t.mutation(internal.stripeEvents.claim, {
			organizationId: orgId,
			eventId: "evt_3",
			eventType: "payment_intent.succeeded",
		});
		expect(dup).toBe("duplicate");
	});

	it("dedupe is per-org — same eventId under another org claims", async () => {
		const t = convexTest(schema, modules);
		await t.mutation(internal.stripeEvents.claim, {
			organizationId: "org_se_a",
			eventId: "evt_shared",
			eventType: "payment_intent.succeeded",
		});
		await t.mutation(internal.stripeEvents.settle, {
			organizationId: "org_se_a",
			eventId: "evt_shared",
			status: "processed",
		});
		const other = await t.mutation(internal.stripeEvents.claim, {
			organizationId: "org_se_b",
			eventId: "evt_shared",
			eventType: "payment_intent.succeeded",
		});
		expect(other).toBe("claimed");
	});

	it("settle never reopens a processed event", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_se_5";
		await t.mutation(internal.stripeEvents.claim, {
			organizationId: orgId,
			eventId: "evt_5",
			eventType: "payment_intent.succeeded",
		});
		await t.mutation(internal.stripeEvents.settle, {
			organizationId: orgId,
			eventId: "evt_5",
			status: "processed",
		});
		// Late failure signal from an overlapping delivery — must not
		// flip the row back to failed.
		await t.mutation(internal.stripeEvents.settle, {
			organizationId: orgId,
			eventId: "evt_5",
			status: "failed",
			errorMessage: "late failure",
		});
		const row = await getRow(t, orgId, "evt_5");
		expect(row?.status).toBe("processed");
	});
});
