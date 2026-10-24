// F461 — audit rows must attribute the caller.
//
// The finding: convex/lib/audit.ts never wrote the ipAddress /
// userAgent columns the auditLogs table already declares, so an
// operator could not attribute an abusive caller to an audit row.
// The fix threads the request's identity from the HTTP edge through
// the mutation args into the audit row.
//
// These pins cover the whole chain, from the header read to the row on
// disk:
//   1. extractRequestIdentity reads the edge-observed address (F65:
//      the LAST X-Forwarded-For entry, never the client-supplied
//      first one) and the user agent.
//   2. logAudit persists both columns when it is given them, and
//      leaves them undefined when the path could not see a request.
//   3. The public booking path (the unauthenticated one an abuser
//      actually walks in through) writes the caller's identity onto
//      its audit row.
//   4. The OTA webhook path does the same end-to-end over HTTP, so a
//      break anywhere between the header read and the row is caught.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import schema from "../schema";
import { internal } from "../_generated/api";
import { logAudit } from "../lib/audit";
import { extractRequestIdentity } from "../lib/requestIdentity";
import { seedTour as sharedSeedTour } from "./helpers";

const modules = import.meta.glob("../**/*.{ts,tsx}");

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

type TestCtx = GenericMutationCtx<DataModel>;

function futureDate(offsetDays: number): string {
	return new Date(Date.now() + offsetDays * 24 * 3_600_000)
		.toISOString()
		.slice(0, 10);
}

async function seedTour(ctx: TestCtx, orgId: string): Promise<Id<"tours">> {
	return await sharedSeedTour(ctx as never, {
		orgId,
		name: "Old Town Walk",
	});
}

describe("F461 — extractRequestIdentity", () => {
	it("prefers CF-Connecting-IP over X-Forwarded-For", () => {
		const request = new Request("https://example.com/x", {
			headers: {
				"cf-connecting-ip": "203.0.113.9",
				"x-forwarded-for": "198.51.100.1",
			},
		});
		expect(extractRequestIdentity(request).ipAddress).toBe("203.0.113.9");
	});

	it("takes the LAST X-Forwarded-For entry, never the client-supplied first (F65)", () => {
		const request = new Request("https://example.com/x", {
			headers: { "x-forwarded-for": "10.0.0.1, 198.51.100.7" },
		});
		// The first entry is client-supplied and spoofable — reading it
		// lets an attacker choose their own bucket.
		expect(extractRequestIdentity(request).ipAddress).toBe("198.51.100.7");
	});

	it("captures the user agent", () => {
		const request = new Request("https://example.com/x", {
			headers: { "user-agent": "Mozilla/5.0 (F461-probe)" },
		});
		expect(extractRequestIdentity(request).userAgent).toBe(
			"Mozilla/5.0 (F461-probe)",
		);
	});

	it("returns no identity when the request carries neither header", () => {
		const identity = extractRequestIdentity(new Request("https://example.com/x"));
		expect(identity.ipAddress).toBeUndefined();
		expect(identity.userAgent).toBeUndefined();
	});
});

describe("F461 — logAudit persists the caller's identity", () => {
	it("writes ipAddress and userAgent when the entry carries them", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await logAudit(ctx, {
				organizationId: "org_a",
				userId: "user_a",
				action: "booking.created_public",
				resourceType: "booking",
				resourceId: "booking_1",
				oldValues: {},
				newValues: {},
				ipAddress: "203.0.113.9",
				userAgent: "curl/8.4.0",
			});
		});
		const rows = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		expect(rows.length).toBe(1);
		expect(rows[0]!.ipAddress).toBe("203.0.113.9");
		expect(rows[0]!.userAgent).toBe("curl/8.4.0");
	});

	it("leaves the identity undefined for a mutation that saw no request", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await logAudit(ctx, {
				organizationId: "org_a",
				userId: "user_a",
				action: "tour.updated",
				resourceType: "tour",
				resourceId: "tour_1",
				oldValues: {},
				newValues: {},
			});
		});
		const rows = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		expect(rows.length).toBe(1);
		expect(rows[0]!.ipAddress).toBeUndefined();
		expect(rows[0]!.userAgent).toBeUndefined();
	});
});

describe("F461 — the public booking path attributes its caller", () => {
	it("writes the caller's identity onto the booking audit row", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_identity";
		const tourId = await t.run(async (ctx) => seedTour(ctx, orgId));

		await t.mutation(internal.public_booking.internalCreate, {
			organizationId: orgId,
			tourId,
			customerName: "Eve Visitor",
			customerEmail: "eve@example.com",
			date: futureDate(4),
			startTime: "10:00",
			guests: 2,
			ipAddress: "203.0.113.9",
			userAgent: "Mozilla/5.0 (F461-probe)",
		});

		const rows = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		const booking = rows.find(
			(r) => r.action === "booking.created_public",
		);
		expect(booking).toBeDefined();
		expect(booking!.ipAddress).toBe("203.0.113.9");
		expect(booking!.userAgent).toBe("Mozilla/5.0 (F461-probe)");
	});
});

describe("F461 — the OTA webhook path attributes its caller", () => {
	async function seedIntegration(ctx: any, orgId: string, provider: string) {
		return await ctx.db.insert("otaIntegrations", {
			organizationId: orgId,
			provider,
			apiKey: "encrypted-blob",
			apiSecret: "encrypted-blob",
			webhookSecret: await (await import("../lib/crypto")).encrypt(
				"test-secret",
			),
			partnerId: "",
			isActive: true,
			isSandbox: true,
			autoSyncAvailability: false,
			autoSyncPricing: false,
			syncIntervalMinutes: 60,
			settings: {},
			createdAt: 0,
			updatedAt: 0,
		});
	}

	async function hmacHex(secret: string, payload: string): Promise<string> {
		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		const sigBuf = await crypto.subtle.sign(
			"HMAC",
			key,
			new TextEncoder().encode(payload),
		);
		return Array.from(new Uint8Array(sigBuf))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}

	const VIATOR_BOOKING_PAYLOAD = {
		eventType: "BOOKING_CREATED",
		reservation: {
			id: "RES-FAC-IDENTITY",
			productCode: "P-100",
			customer: { name: "Alice", email: "alice@example.com" },
			guests: 2,
			tourDate: "2026-08-01",
			totalPaid: 200,
			currency: "USD",
			commissionRate: 0.2,
		},
	};

	const WEBHOOK_PATH = "/api/ota/webhooks/viator";

	it("records the edge-observed address on the audit row, over HTTP", async () => {
		const t = convexTest(schema, modules);
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_identity", "viator"),
		);
		const body = JSON.stringify(VIATOR_BOOKING_PAYLOAD);
		const sig = await hmacHex("test-secret", body);
		const res = await t.fetch(
			`${WEBHOOK_PATH}?integrationId=${integrationId}`,
			{
				method: "POST",
				body,
				headers: {
					"x-viator-signature": sig,
					"x-viator-timestamp": String(Date.now()),
					"cf-connecting-ip": "203.0.113.42",
					"user-agent": "Viator-Webhook/1.0",
				},
			},
		);
		expect(res.status).toBe(200);

		const rows = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		const created = rows.find((r) => r.action === "ota_booking.created");
		expect(created).toBeDefined();
		expect(created!.ipAddress).toBe("203.0.113.42");
		expect(created!.userAgent).toBe("Viator-Webhook/1.0");
	});

	it("ignores a client-supplied X-Forwarded-For prefix (F65)", async () => {
		const t = convexTest(schema, modules);
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_identity_spoof", "viator"),
		);
		const body = JSON.stringify(VIATOR_BOOKING_PAYLOAD);
		const sig = await hmacHex("test-secret", body);
		const res = await t.fetch(
			`${WEBHOOK_PATH}?integrationId=${integrationId}`,
			{
				method: "POST",
				body,
				headers: {
					"x-viator-signature": sig,
					"x-viator-timestamp": String(Date.now()),
					// The attacker picks the first entry; the edge saw the last.
					"x-forwarded-for": "10.0.0.1, 198.51.100.7",
				},
			},
		);
		expect(res.status).toBe(200);

		const rows = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		const created = rows.find((r) => r.action === "ota_booking.created");
		expect(created).toBeDefined();
		expect(created!.ipAddress).toBe("198.51.100.7");
	});
});
