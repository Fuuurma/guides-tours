// GT-AUDIT-01 — the phone-reminder 7-day cooldown was bypassed for the most
// recently reminded staff.
//
// The four call sites read `lastSentAt` from a single `.take(500)` page of
// the `by_org` index and treated absence as "never reminded". `by_org`
// returns rows in creation order, so that page holds the 500 OLDEST sends —
// precisely the ones least likely to be inside the cooldown — and drops the
// newest, which are the ones most likely to be. The result was inverted:
// recently-reminded staff were re-reminded inside the 7-day window, and
// `cooldownStatus` reported the bypassed state as correct.
//
// This is deliberately not the F468 `{items, truncated}` shape: nothing here
// reports that a decision consumed a truncated set. It just silently decided
// the opposite of the truth.
//
// The fix resolves lastSentAt per candidate through `by_org_user`. These
// tests pin the property that matters — a user whose send row sits anywhere
// in the org is found, and its absence is found just as reliably.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { lastSentAtByUserId } from "../phoneReminders";

const modules = import.meta.glob("../**/*.{ts,tsx}");

const ORG = "org_test";
const PAGE = 500;

type TClient = ReturnType<typeof convexTest>;

/**
 * A Map is not a Convex-serializable value, so the pairs are spread INSIDE
 * t.run and rebuilt outside. Doing it the other way round fails with
 * "Map[...] is not a supported Convex type" — which, on a helper that
 * returns the whole org, prints thousands of entries and buries whatever
 * assertion actually mattered.
 */
async function lookup(t: TClient, userIds: string[]): Promise<Map<string, number>> {
	const pairs = await t.run(
		async (ctx) => [...(await lastSentAtByUserId(ctx as never, ORG, userIds))],
	);
	return new Map(pairs);
}


/** Insert `count` send rows for filler users, oldest first. */
async function seedFiller(t: TClient, count: number) {
	await t.run(async (ctx) => {
		for (let i = 0; i < count; i++) {
			await ctx.db.insert("phoneReminderSends", {
				organizationId: ORG,
				userId: `filler_${i}`,
				lastSentAt: 1_700_000_000_000 + i,
			});
		}
	});
}

describe("GT-AUDIT-01 — cooldown lookups must not drop the newest sends", () => {
	it("finds a user whose send row falls past a 500-row page", async () => {
		const t = convexTest(schema, modules);
		await seedFiller(t, PAGE);
		// The one row a creation-ordered page would drop.
		await t.run((ctx) =>
			ctx.db.insert("phoneReminderSends", {
				organizationId: ORG,
				userId: "recently_reminded",
				lastSentAt: 1_800_000_000_000,
			}),
		);

		const map = await lookup(t, ["recently_reminded"]);

		expect(map.get("recently_reminded")).toBe(1_800_000_000_000);
	});

	it("still reports a user with no send row as absent", async () => {
		const t = convexTest(schema, modules);
		await seedFiller(t, 5);

		const map = await lookup(t, ["never_reminded"]);

		// Absence must stay absence. A lookup that returned a fabricated
		// default would put every never-reminded user permanently in cooldown.
		expect(map.has("never_reminded")).toBe(false);
	});

	it("returns exactly the requested candidates, not the whole org", async () => {
		const t = convexTest(schema, modules);
		await seedFiller(t, 20);

		const map = await lookup(t, ["filler_3", "filler_9"]);

		expect([...map.keys()].sort()).toEqual(["filler_3", "filler_9"]);
	});

	it("does not cross organizations", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("phoneReminderSends", {
				organizationId: "org_other",
				userId: "shared_user",
				lastSentAt: 1_800_000_000_000,
			});
		});

		const map = await lookup(t, ["shared_user"]);

		expect(map.has("shared_user")).toBe(false);
	});
});