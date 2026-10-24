import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";
import { CLEANUP_MAX_LOGS } from "../notifications";

// The sweep touches no auth: it runs as "system" and only writes. The
// mock keeps the module import graph (lib/authz -> ../auth) satisfied.
vi.mock("../auth", () => ({
	authComponent: {
		getAuthUser: async () => null,
		safeGetAuthUser: async () => undefined,
		getAuth: async () => ({
			auth: { api: {} },
			headers: new Headers(),
		}),
	},
	createAuth: (() => ({})) as never,
}));

const modules = import.meta.glob("../**/*.{ts,tsx}");

const NOW = Date.now();
const OLD = NOW - 31 * 24 * 60 * 60 * 1000; // past the 30-day retention

/* eslint-disable @typescript-eslint/no-explicit-any -- convex/ sits outside
   biome's scope and the convex-test ctx has no exported type here; the
   sibling availabilities.test.ts uses the same looseness. */
type TestT = {
	run: <R>(f: (ctx: any) => Promise<R>) => Promise<R>;
	mutation: (ref: unknown, args?: Record<string, never>) => Promise<any>;
};

async function seedOldLog(t: TestT) {
	return await t.run(async (ctx) =>
		ctx.db.insert("notificationLogs", {
			organizationId: "org_cleanup",
			templateName: "booking_confirmed",
			channel: "email",
			recipient: "reader@example.com",
			status: "sent",
			metadata: {},
			createdAt: OLD,
		}),
	);
}

async function countOld(t: TestT) {
	return await t.run(async (ctx) =>
		ctx.db
			.query("notificationLogs")
			.filter((q: any) => q.lt(q.field("createdAt"), NOW))
			.collect(),
	);
}

// F421 — the sweep deleted at most 5000 rows per DAY while production
// writes up to ~28.8k notificationLogs rows a day, so both notification
// tables grew without bound. The budgets now re-schedule the sweep
// whenever one fills, so a backlog drains in chained immediate runs
// until one finishes under budget.
describe("cleanupOldNotifications self-continuation", () => {
	it("flags continuation when a budget fills and drains the rest next run", async () => {
		const t = convexTest(schema, modules) as unknown as TestT;
		const total = CLEANUP_MAX_LOGS + 5;
		for (let i = 0; i < total; i++) {
			await seedOldLog(t);
		}

		const first = await t.mutation(
			internal.notifications.cleanupOldNotifications,
			{},
		);
		expect(first.logsDeleted).toBe(CLEANUP_MAX_LOGS);
		expect(first.continued).toBe(true);

		// Whether the scheduled continuation already ran inline or is
		// picked up by the next invocation, one more run finishes the job.
		const second = await t.mutation(
			internal.notifications.cleanupOldNotifications,
			{},
		);
		expect(second.continued).toBe(false);
		const remaining = await countOld(t);
		expect(remaining).toEqual([]);
	});

	it("does not chain when the sweep finishes under budget", async () => {
		const t = convexTest(schema, modules) as unknown as TestT;
		for (let i = 0; i < 5; i++) {
			await seedOldLog(t);
		}
		const result = await t.mutation(
			internal.notifications.cleanupOldNotifications,
			{},
		);
		expect(result.logsDeleted).toBe(5);
		expect(result.continued).toBe(false);
		const remaining = await countOld(t);
		expect(remaining).toEqual([]);
	});
});
