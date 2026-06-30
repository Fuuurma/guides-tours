// Tests for the public booking rate limit.
//
// Verifies:
// - First attempts are allowed
// - Up to MAX_ATTEMPTS_PER_EMAIL allowed in window
// - Beyond the cap, attempts are rejected
// - Window slides: old attempts outside the window don't count
// - purgeOld removes old rows
// - countAttempts reflects current state

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";
import type { FunctionReference } from "convex/server";
import {
	MAX_ATTEMPTS_PER_EMAIL,
	WINDOW_MS,
} from "../lib/rate_limit";

const modules = import.meta.glob("../**/*.{ts,tsx}");

// Cast the internal API to access lib/rate_limit functions, which
// the generated FilterApi strips because Convex auto-discovers lib/
// modules under their path-keyed names.
const recordAttempt = (internal as unknown as {
	"lib/rate_limit": {
		recordAttempt: FunctionReference<
			"mutation",
			"internal",
			{
				email: string;
				slug: string;
				organizationId: string | undefined;
				outcome: string;
			},
			{
				allowed: boolean;
				attempts: number;
				attemptId: import("../_generated/dataModel").Id<"publicBookingAttempts">;
			}
		>;
		countAttempts: FunctionReference<
			"query",
			"internal",
			{ email: string },
			{ count: number; limit: number; windowMs: number }
		>;
		purgeOld: FunctionReference<
			"mutation",
			"internal",
			Record<string, never>,
			{ deleted: number }
		>;
		updateAttemptOutcome: FunctionReference<
			"mutation",
			"internal",
			{
				attemptId: import("../_generated/dataModel").Id<"publicBookingAttempts">;
				outcome: string;
				organizationId?: string;
			},
			{ updated: boolean }
		>;
	};
})["lib/rate_limit"];

describe("public booking rate limit", () => {
	test("allows up to MAX_ATTEMPTS_PER_EMAIL attempts per email", async () => {
		const t = convexTest(schema, modules);
		const email = "alice@example.com";
		const slug = "test-org";

		for (let i = 0; i < MAX_ATTEMPTS_PER_EMAIL; i++) {
			const r = await t.mutation(recordAttempt.recordAttempt, {
				email,
				slug,
				organizationId: undefined,
				outcome: "pending",
			});
			expect(r.allowed).toBe(true);
		}
	});

	test("rejects the (N+1)th attempt in the window", async () => {
		const t = convexTest(schema, modules);
		const email = "bob@example.com";
		const slug = "test-org";

		for (let i = 0; i < MAX_ATTEMPTS_PER_EMAIL; i++) {
			await t.mutation(recordAttempt.recordAttempt, {
				email,
				slug,
				organizationId: undefined,
				outcome: "pending",
			});
		}
		// One more attempt → rejected
		const r = await t.mutation(recordAttempt.recordAttempt, {
			email,
			slug,
			organizationId: undefined,
			outcome: "pending",
		});
		expect(r.allowed).toBe(false);
		expect(r.attempts).toBe(MAX_ATTEMPTS_PER_EMAIL + 1);
	});

	test("rejected attempts are recorded with outcome=rejected_rate_limit", async () => {
		const t = convexTest(schema, modules);
		const email = "carol@example.com";
		const slug = "test-org";

		for (let i = 0; i < MAX_ATTEMPTS_PER_EMAIL + 2; i++) {
			await t.mutation(recordAttempt.recordAttempt, {
				email,
				slug,
				organizationId: undefined,
				outcome: "pending",
			});
		}
		const rows = await t.run(async (ctx) =>
			ctx.db.query("publicBookingAttempts").collect(),
		);
		const rejected = rows.filter(
			(r: { outcome: string }) => r.outcome === "rejected_rate_limit",
		);
		expect(rejected.length).toBe(2);
	});

	test("different emails have independent quotas", async () => {
		const t = convexTest(schema, modules);
		// Burn one email's quota
		for (let i = 0; i < MAX_ATTEMPTS_PER_EMAIL; i++) {
			await t.mutation(recordAttempt.recordAttempt, {
				email: "dave@example.com",
				slug: "test-org",
				organizationId: undefined,
				outcome: "pending",
			});
		}
		// A different email should still be allowed
		const r = await t.mutation(recordAttempt.recordAttempt, {
			email: "eve@example.com",
			slug: "test-org",
			organizationId: undefined,
			outcome: "pending",
		});
		expect(r.allowed).toBe(true);
	});

	test("countAttempts returns current state", async () => {
		const t = convexTest(schema, modules);
		const email = "frank@example.com";
		await t.mutation(recordAttempt.recordAttempt, {
			email,
			slug: "test-org",
			organizationId: undefined,
			outcome: "pending",
		});
		await t.mutation(recordAttempt.recordAttempt, {
			email,
			slug: "test-org",
			organizationId: undefined,
			outcome: "pending",
		});
		const c = await t.query(recordAttempt.countAttempts, {
			email,
		});
		expect(c.count).toBe(2);
		expect(c.limit).toBe(MAX_ATTEMPTS_PER_EMAIL);
		expect(c.windowMs).toBe(WINDOW_MS);
	});

	test("purgeOld removes rows older than 2× window", async () => {
		const t = convexTest(schema, modules);
		const email = "grace@example.com";
		// Insert an old row manually (5 hours ago)
		await t.run(async (ctx) => {
			await ctx.db.insert("publicBookingAttempts", {
				organizationId: undefined,
				email,
				slug: "test-org",
				outcome: "pending",
				createdAt: Date.now() - 5 * 60 * 60 * 1000,
			});
		});
		// Insert a recent row
		await t.mutation(recordAttempt.recordAttempt, {
			email,
			slug: "test-org",
			organizationId: undefined,
			outcome: "pending",
		});
		// Purge
		const r = await t.mutation(recordAttempt.purgeOld, {});
		expect(r.deleted).toBe(1);
		// Recent row should still be there
		const rows = await t.run(async (ctx) =>
			ctx.db.query("publicBookingAttempts").collect(),
		);
		expect(rows.length).toBe(1);
	});

	test("recordAttempt returns attemptId for later outcome update", async () => {
		const t = convexTest(schema, modules);
		const r = await t.mutation(recordAttempt.recordAttempt, {
			email: "henry@example.com",
			slug: "test-org",
			organizationId: undefined,
			outcome: "pending",
		});
		expect(r.attemptId).toBeDefined();
		// The attempt row should exist with the initial outcome
		const rows = await t.run(async (ctx) =>
			ctx.db
				.query("publicBookingAttempts")
				.filter((q) => q.eq(q.field("_id"), r.attemptId))
				.collect(),
		);
		expect(rows.length).toBe(1);
		expect(rows[0]!.outcome).toBe("pending");
	});

	test("updateAttemptOutcome changes the outcome in place", async () => {
		const t = convexTest(schema, modules);
		const r = await t.mutation(recordAttempt.recordAttempt, {
			email: "iris@example.com",
			slug: "test-org",
			organizationId: undefined,
			outcome: "pending",
		});
		const upd = await t.mutation(recordAttempt.updateAttemptOutcome, {
			attemptId: r.attemptId,
			outcome: "success",
		});
		expect(upd.updated).toBe(true);
		const rows = await t.run(async (ctx) =>
			ctx.db
				.query("publicBookingAttempts")
				.filter((q) => q.eq(q.field("_id"), r.attemptId))
				.collect(),
		);
		expect(rows[0]!.outcome).toBe("success");
	});

	test("updateAttemptOutcome can record failure outcomes", async () => {
		const t = convexTest(schema, modules);
		const r = await t.mutation(recordAttempt.recordAttempt, {
			email: "jack@example.com",
			slug: "test-org",
			organizationId: undefined,
			outcome: "pending",
		});
		await t.mutation(recordAttempt.updateAttemptOutcome, {
			attemptId: r.attemptId,
			outcome: "failure_org_not_found",
		});
		const rows = await t.run(async (ctx) =>
			ctx.db
				.query("publicBookingAttempts")
				.filter((q) => q.eq(q.field("_id"), r.attemptId))
				.collect(),
		);
		expect(rows[0]!.outcome).toBe("failure_org_not_found");
	});

	test("updateAttemptOutcome can backfill organizationId", async () => {
		// The attempt is recorded BEFORE the slug → org lookup so we
		// can rate-limit unknown-slug spray. Once we know the orgId
		// (or confirm the slug doesn't resolve), the caller patches
		// it in via updateAttemptOutcome.
		const t = convexTest(schema, modules);
		const r = await t.mutation(recordAttempt.recordAttempt, {
			email: "kate@example.com",
			slug: "test-org",
			organizationId: undefined,
			outcome: "pending",
		});
		// organizationId is undefined initially
		const beforePatch = await t.run(async (ctx) => ctx.db.get(r.attemptId));
		expect(beforePatch?.organizationId).toBeUndefined();
		// Patch in the orgId once we've resolved the slug
		await t.mutation(recordAttempt.updateAttemptOutcome, {
			attemptId: r.attemptId,
			outcome: "success",
			organizationId: "org_abc123",
		});
		const afterPatch = await t.run(async (ctx) => ctx.db.get(r.attemptId));
		expect(afterPatch?.organizationId).toBe("org_abc123");
		expect(afterPatch?.outcome).toBe("success");
	});

	test("updateAttemptOutcome leaves organizationId untouched when not provided", async () => {
		// Passing only outcome (no organizationId) must NOT clear an
		// already-set organizationId. This protects against accidentally
		// unsetting it on later outcome updates.
		const t = convexTest(schema, modules);
		const r = await t.mutation(recordAttempt.recordAttempt, {
			email: "liam@example.com",
			slug: "test-org",
			organizationId: "org_first",
			outcome: "pending",
		});
		await t.mutation(recordAttempt.updateAttemptOutcome, {
			attemptId: r.attemptId,
			outcome: "success",
		});
		const row = await t.run(async (ctx) => ctx.db.get(r.attemptId));
		expect(row?.organizationId).toBe("org_first");
		expect(row?.outcome).toBe("success");
	});
});
