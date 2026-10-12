import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,tsx}");

const ORG = "org_claim";

// F680: the claim contract for reminder sends. An overlapping cron tick
// (Convex does not skip ticks) or a queued action re-scanning during a
// slow SES send previously re-sent the same reminder because the
// cooldown stamp only landed after success. The claim now owns the send.
describe("phoneReminderSends claim (F680)", () => {
	it("first claim wins; an overlapping claim inside the TTL loses", async () => {
		const t = convexTest(schema, modules);
		const first = await t.mutation(internal.phoneReminders.claimUserSend, {
			organizationId: ORG,
			userId: "user-1",
		});
		expect(first).toEqual({ claimed: true });
		const second = await t.mutation(internal.phoneReminders.claimUserSend, {
			organizationId: ORG,
			userId: "user-1",
		});
		expect(second).toEqual({ claimed: false, reason: "claimed" });
	});

	it("a send inside the 7d cooldown loses to the cooldown, not the claim", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		const DAY = 24 * 60 * 60 * 1000;
		await t.run(async (ctx) => {
			await ctx.db.insert("phoneReminderSends", {
				organizationId: ORG,
				userId: "user-2",
				lastSentAt: now - 2 * DAY,
			});
		});
		const result = await t.mutation(internal.phoneReminders.claimUserSend, {
			organizationId: ORG,
			userId: "user-2",
		});
		expect(result).toEqual({ claimed: false, reason: "cooldown" });
	});

	it("clearUserClaim releases a dead claim so a retry can re-claim", async () => {
		const t = convexTest(schema, modules);
		await t.mutation(internal.phoneReminders.claimUserSend, {
			organizationId: ORG,
			userId: "user-3",
		});
		await t.mutation(internal.phoneReminders.clearUserClaim, {
			organizationId: ORG,
			userId: "user-3",
		});
		const reClaim = await t.mutation(internal.phoneReminders.claimUserSend, {
			organizationId: ORG,
			userId: "user-3",
		});
		expect(reClaim).toEqual({ claimed: true });
	});

	it("a claim older than the TTL is stale and re-claimable", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		const MIN = 60 * 1000;
		await t.run(async (ctx) => {
			await ctx.db.insert("phoneReminderSends", {
				organizationId: ORG,
				userId: "user-4",
				lastSentAt: now - 30 * 24 * 60 * 60 * 1000,
				claimedAt: now - 20 * MIN,
			});
		});
		const result = await t.mutation(internal.phoneReminders.claimUserSend, {
			organizationId: ORG,
			userId: "user-4",
		});
		expect(result).toEqual({ claimed: true });
		await t.run(async (ctx) => {
			const row = await ctx.db
				.query("phoneReminderSends")
				.withIndex("by_org_user", (q) =>
					q.eq("organizationId", ORG).eq("userId", "user-4"),
				)
				.unique();
			// The re-claim stamped a fresh claimedAt.
			expect(row?.claimedAt).toBeGreaterThan(now - MIN);
		});
	});

	it("different users claim independently", async () => {
		const t = convexTest(schema, modules);
		const a = await t.mutation(internal.phoneReminders.claimUserSend, {
			organizationId: ORG,
			userId: "user-a",
		});
		const b = await t.mutation(internal.phoneReminders.claimUserSend, {
			organizationId: ORG,
			userId: "user-b",
		});
		expect(a).toEqual({ claimed: true });
		expect(b).toEqual({ claimed: true });
	});
});
