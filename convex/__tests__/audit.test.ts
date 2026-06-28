// Tests for the shared logAudit helper.
//
// logAudit is the canonical way for mutations to record an audit
// log row. It eliminates the repeated `ctx.db.insert("auditLogs",
// { ... })` boilerplate across 17 mutation files.
//
// The helper just inserts one row with the diff — there's no
// branching logic to test. But pinning the contract (field shape,
// timestamp auto-set, organizationId passed through) prevents
// silent drift when someone refactors a caller.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { logAudit } from "../lib/audit";

const modules = import.meta.glob("../**/*.{ts,tsx}");

describe("convex/lib/audit — logAudit", () => {
	it("inserts an audit row with the expected shape", async () => {
		const t = convexTest(schema, modules);
		const before = Date.now();
		await t.run(async (ctx) => {
			await logAudit(ctx, {
				organizationId: "org_a",
				userId: "user_a",
				action: "customer.created",
				resourceType: "customer",
				resourceId: "cust_1",
				oldValues: {},
				newValues: { email: "alice@example.com", name: "Alice" },
			});
		});
		const after = Date.now();

		const rows = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		expect(rows.length).toBe(1);
		const row = rows[0]!;
		expect(row.organizationId).toBe("org_a");
		expect(row.userId).toBe("user_a");
		expect(row.action).toBe("customer.created");
		expect(row.resourceType).toBe("customer");
		expect(row.resourceId).toBe("cust_1");
		expect(row.oldValues).toEqual({});
		expect(row.newValues).toEqual({
			email: "alice@example.com",
			name: "Alice",
		});
		// Timestamp is auto-set via Date.now() inside the helper.
		expect(row.timestamp).toBeGreaterThanOrEqual(before);
		expect(row.timestamp).toBeLessThanOrEqual(after);
	});

	it("supports optional userId for system-initiated mutations", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await logAudit(ctx, {
				organizationId: "org_a",
				userId: "system",
				action: "booking.cron_cancelled",
				resourceType: "booking",
				resourceId: "booking_1",
				oldValues: { status: "pending" },
				newValues: { status: "cancelled" },
			});
		});
		const rows = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		expect(rows.length).toBe(1);
		expect(rows[0]!.userId).toBe("system");
	});

	it("preserves complex values (nested objects, arrays, bigints)", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await logAudit(ctx, {
				organizationId: "org_a",
				userId: "user_a",
				action: "tour.updated",
				resourceType: "tour",
				resourceId: "tour_1",
				oldValues: {
					basePriceCents: 1000n,
					languages: ["en"],
				},
				newValues: {
					basePriceCents: 2000n,
					languages: ["en", "es"],
					inclusions: ["Lunch", "Guide"],
				},
			});
		});
		const rows = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		expect(rows.length).toBe(1);
		const row = rows[0]!;
		// Bigints stay as bigints within the same ctx (Convex
		// serializes to strings only at the wire boundary).
		expect(row.oldValues).toEqual({
			basePriceCents: 1000n,
			languages: ["en"],
		});
		expect(row.newValues).toEqual({
			basePriceCents: 2000n,
			languages: ["en", "es"],
			inclusions: ["Lunch", "Guide"],
		});
	});
});