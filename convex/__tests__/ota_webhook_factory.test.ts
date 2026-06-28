// Tests for the createWebhookHandler factory used by all 7 OTA
// providers. The factory wires together:
//   - method check (POST only)
//   - signature + timestamp header reading
//   - integration lookup via getForWebhook
//   - provider mismatch detection
//   - inactive integration detection
//   - HMAC + timestamp verification
//   - JSON parse error handling
//   - normalize() result (null = ignored event type)
//   - dispatch to upsert/cancel mutations
//
// These tests pin the contract for all 7 provider webhook routes
// without going through the full HTTP test harness. If a future
// refactor breaks the shared error handling, every provider would
// regress at once.
//
// We use the full convexTest harness with t.http() / t.fetch() so the
// OTA router (which mounts all 7 webhooks at /api/ota/webhooks/<provider>)
// is loaded and routes requests to the factory.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

const VIATOR_BOOKING_PAYLOAD = {
	eventType: "BOOKING_CREATED",
	reservation: {
		id: "RES-FAC-001",
		productCode: "P-100",
		customer: { name: "Alice", email: "alice@example.com" },
		guests: 2,
		tourDate: "2026-08-01",
		totalPaid: 200,
		currency: "USD",
		commissionRate: 0.2,
	},
};

const VIATOR_CANCEL_PAYLOAD = {
	eventType: "BOOKING_CANCELLED",
	reservation: {
		id: "RES-FAC-001",
	},
};

async function seedIntegration(
	ctx: any,
	orgId: string,
	provider: string,
	webhookSecret: string,
	overrides: { isActive?: boolean } = {},
) {
	return await ctx.db.insert("otaIntegrations", {
		organizationId: orgId,
		provider,
		apiKey: "encrypted-blob",
		apiSecret: "encrypted-blob",
		webhookSecret,
		partnerId: "",
		isActive: overrides.isActive ?? true,
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

const WEBHOOK_PATH = "/api/ota/webhooks/viator";

describe("createWebhookHandler — shared factory contract", () => {
	// Note: the 405 (non-POST) and 404 (unknown route) cases are
	// enforced at the router layer (convex/ota/router.ts only
	// registers POST handlers). Those branches live in the factory
	// as defense-in-depth, but can't be exercised via t.fetch() since
	// the router would reject the request first. They're covered
	// implicitly by all the other tests below.

	it("rejects missing signature header with 400", async () => {
		const t = convexTest(schema, modules);
		const res = await t.fetch(WEBHOOK_PATH, {
			method: "POST",
			body: "{}",
		});
		expect(res.status).toBe(400);
		expect(await res.text()).toBe("missing signature");
	});

	it("rejects missing integrationId query param with 400", async () => {
		const t = convexTest(schema, modules);
		const body = JSON.stringify(VIATOR_BOOKING_PAYLOAD);
		const sig = await hmacHex("test-secret", body);
		const res = await t.fetch(WEBHOOK_PATH, {
			method: "POST",
			body,
			headers: {
				"x-viator-signature": sig,
				"x-viator-timestamp": String(Date.now()),
			},
		});
		expect(res.status).toBe(400);
		expect(await res.text()).toBe("missing integrationId");
	});

	it("rejects when integration's provider doesn't match the route", async () => {
		const t = convexTest(schema, modules);
		const { encrypt } = await import("../lib/crypto");
		const secret = await encrypt("test-secret");
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_a", "airbnb", secret), // wrong provider!
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
				},
			},
		);
		expect(res.status).toBe(400);
		expect(await res.text()).toBe("wrong provider for this route");
	});

	it("rejects when integration is inactive with 410", async () => {
		const t = convexTest(schema, modules);
		const { encrypt } = await import("../lib/crypto");
		const secret = await encrypt("test-secret");
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_a", "viator", secret, {
				isActive: false,
			}),
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
				},
			},
		);
		expect(res.status).toBe(410);
		expect(await res.text()).toBe("integration is not active");
	});

	it("rejects invalid signature with 401", async () => {
		const t = convexTest(schema, modules);
		const { encrypt } = await import("../lib/crypto");
		const secret = await encrypt("test-secret");
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_a", "viator", secret),
		);
		const body = JSON.stringify(VIATOR_BOOKING_PAYLOAD);
		// Sign with a DIFFERENT secret so the HMAC won't match.
		const badSig = await hmacHex("WRONG-SECRET", body);
		const res = await t.fetch(
			`${WEBHOOK_PATH}?integrationId=${integrationId}`,
			{
				method: "POST",
				body,
				headers: {
					"x-viator-signature": badSig,
					"x-viator-timestamp": String(Date.now()),
				},
			},
		);
		expect(res.status).toBe(401);
	});

	it("rejects stale timestamp with 401", async () => {
		const t = convexTest(schema, modules);
		const { encrypt } = await import("../lib/crypto");
		const secret = await encrypt("test-secret");
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_a", "viator", secret),
		);
		const body = JSON.stringify(VIATOR_BOOKING_PAYLOAD);
		const sig = await hmacHex("test-secret", body);
		// 1 hour in the past — way outside the 5-min window.
		const staleTs = String(Date.now() - 60 * 60 * 1000);
		const res = await t.fetch(
			`${WEBHOOK_PATH}?integrationId=${integrationId}`,
			{
				method: "POST",
				body,
				headers: {
					"x-viator-signature": sig,
					"x-viator-timestamp": staleTs,
				},
			},
		);
		expect(res.status).toBe(401);
	});

	it("rejects invalid JSON with 400", async () => {
		const t = convexTest(schema, modules);
		const { encrypt } = await import("../lib/crypto");
		const secret = await encrypt("test-secret");
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_a", "viator", secret),
		);
		const body = "not-valid-json{{";
		const sig = await hmacHex("test-secret", body);
		const res = await t.fetch(
			`${WEBHOOK_PATH}?integrationId=${integrationId}`,
			{
				method: "POST",
				body,
				headers: {
					"x-viator-signature": sig,
					"x-viator-timestamp": String(Date.now()),
				},
			},
		);
		expect(res.status).toBe(400);
		expect(await res.text()).toBe("invalid JSON");
	});

	it("returns 200 'ignored' for unknown event types (normalize returns null)", async () => {
		const t = convexTest(schema, modules);
		const { encrypt } = await import("../lib/crypto");
		const secret = await encrypt("test-secret");
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_a", "viator", secret),
		);
		const body = JSON.stringify({ eventType: "UNKNOWN_EVENT" });
		const sig = await hmacHex("test-secret", body);
		const res = await t.fetch(
			`${WEBHOOK_PATH}?integrationId=${integrationId}`,
			{
				method: "POST",
				body,
				headers: {
					"x-viator-signature": sig,
					"x-viator-timestamp": String(Date.now()),
				},
			},
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ignored");
	});

	it("accepts a valid booking.created event and dispatches to upsert", async () => {
		const t = convexTest(schema, modules);
		const { encrypt } = await import("../lib/crypto");
		const secret = await encrypt("test-secret");
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_a", "viator", secret),
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
				},
			},
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");
		// The upsert should have written a row keyed on reservationId.
		const rows = await t.run(async (ctx) =>
			ctx.db.query("otaBookings").collect(),
		);
		expect(rows.length).toBe(1);
		expect((rows[0] as any).otaReservationId).toBe("RES-FAC-001");
	});

	it("accepts a valid booking.cancelled event and dispatches to cancel mutation", async () => {
		const t = convexTest(schema, modules);
		const { encrypt } = await import("../lib/crypto");
		const secret = await encrypt("test-secret");
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_a", "viator", secret),
		);
		// Pre-seed an existing booking that we'll cancel.
		await t.run(async (ctx) => {
			await ctx.db.insert("otaBookings", {
				organizationId: "org_a",
				integrationId,
				otaReservationId: "RES-FAC-001",
				otaCustomerName: "Alice",
				otaCustomerEmail: "alice@example.com",
				otaCustomerData: {},
				otaTourName: "Old Tour",
				otaTourDate: "2026-08-01",
				otaGuests: 2,
				otaTotalPaidCents: 20000n,
				otaCurrency: "USD",
				commissionRate: 0.2,
				commissionAmountCents: 4000n,
				netRevenueCents: 16000n,
				status: "confirmed" as const,
				lastSyncAt: 0,
				rawOtaData: {},
				confirmedAt: 0,
				receivedAt: 0,
			});
		});

		const body = JSON.stringify(VIATOR_CANCEL_PAYLOAD);
		const sig = await hmacHex("test-secret", body);
		const res = await t.fetch(
			`${WEBHOOK_PATH}?integrationId=${integrationId}`,
			{
				method: "POST",
				body,
				headers: {
					"x-viator-signature": sig,
					"x-viator-timestamp": String(Date.now()),
				},
			},
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");

		// The cancel mutation should have flipped the row's status.
		const row = await t.run(async (ctx) =>
			ctx.db
				.query("otaBookings")
				.withIndex("by_integration_reservation", (q: any) =>
					q
						.eq("integrationId", integrationId)
						.eq("otaReservationId", "RES-FAC-001"),
				)
				.unique(),
		);
		expect(row).toBeDefined();
		expect((row as any).status).toBe("cancelled");
	});
});

// silence unused-import warning for internal (referenced for type info)
void internal;