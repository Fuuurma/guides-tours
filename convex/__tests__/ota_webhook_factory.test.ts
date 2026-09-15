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
import { extractEventId } from "../ota/webhook_handler";

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

	// F91: the dashboard and DEPLOYMENT.md publish
	// /api/ota/webhooks/{providerId} using the lowercase ids from
	// types.ts/ota-providers.ts. Router paths must match exactly —
	// httpRouter is case-sensitive, so a camelCase mount 404s the
	// registered URL before any signature check.
	it.each([
		"airbnb",
		"booking",
		"expedia",
		"getyourguide",
		"klook",
		"tripadvisor",
		"viator",
	])("mounts /api/ota/webhooks/%s at the canonical lowercase path", async (provider) => {
		const t = convexTest(schema, modules);
		const res = await t.fetch(`/api/ota/webhooks/${provider}`, {
			method: "POST",
			body: "{}",
		});
		// Reaching the handler = 400 "missing signature"; a wrong-case
		// mount would fall through the router as 404.
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

	it("rejects a malformed integrationId with 400, not a 500 (F123)", async () => {
		const t = convexTest(schema, modules);
		const body = JSON.stringify(VIATOR_BOOKING_PAYLOAD);
		const sig = await hmacHex("test-secret", body);
		const res = await t.fetch(
			`${WEBHOOK_PATH}?integrationId=not-a-real-id`,
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
		expect(await res.text()).toBe("invalid integrationId");
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

	it("signed-but-malformed payload gets 400 + a failed delivery audit row (F130)", async () => {
		const t = convexTest(schema, modules);
		const { encrypt } = await import("../lib/crypto");
		const secret = await encrypt("test-secret");
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_malformed", "viator", secret),
		);
		// Parses as JSON but normalize() throws — the reservation has no
		// id/reservationId for stringOrThrow.
		const body = JSON.stringify({
			eventType: "BOOKING_CREATED",
			reservation: { productCode: "P-1" },
		});
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
		expect(await res.text()).toBe("malformed payload");
		// The poison delivery is audited as failed, not silent.
		const deliveries = await t.run(async (ctx) =>
			ctx.db
				.query("webhookDeliveries")
				.withIndex("by_org", (q) => q.eq("organizationId", "org_malformed"))
				.collect(),
		);
		expect(deliveries.length).toBe(1);
		expect(deliveries[0]?.eventType).toBe("malformed");
		expect(deliveries[0]?.status).toBe("failed");
		expect(deliveries[0]?.eventId).toMatch(/^malformed:/);
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
				otaCustomerData: { guests: 2 },
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

	it("does not echo the verify-failure reason in the 401 body", async () => {
		const t = convexTest(schema, modules);
		const { encrypt } = await import("../lib/crypto");
		const secret = await encrypt("test-secret");
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_a", "viator", secret),
		);
		const body = JSON.stringify(VIATOR_BOOKING_PAYLOAD);
		const sig = await hmacHex("test-secret", body);
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
		// Generic body — must not leak which check failed ("too_old").
		expect(await res.text()).toBe("invalid signature");
	});

	it("a cancel after a create for the same reservation still dispatches", async () => {
		const t = convexTest(schema, modules);
		const { encrypt } = await import("../lib/crypto");
		const secret = await encrypt("test-secret");
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_a", "viator", secret),
		);

		// Create the booking through the wire first — this records a
		// delivery whose eventId must NOT collide with the cancel's.
		const createBody = JSON.stringify(VIATOR_BOOKING_PAYLOAD);
		const createSig = await hmacHex("test-secret", createBody);
		const createRes = await t.fetch(
			`${WEBHOOK_PATH}?integrationId=${integrationId}`,
			{
				method: "POST",
				body: createBody,
				headers: {
					"x-viator-signature": createSig,
					"x-viator-timestamp": String(Date.now()),
				},
			},
		);
		expect(createRes.status).toBe(200);

		const cancelBody = JSON.stringify(VIATOR_CANCEL_PAYLOAD);
		const cancelSig = await hmacHex("test-secret", cancelBody);
		const cancelRes = await t.fetch(
			`${WEBHOOK_PATH}?integrationId=${integrationId}`,
			{
				method: "POST",
				body: cancelBody,
				headers: {
					"x-viator-signature": cancelSig,
					"x-viator-timestamp": String(Date.now()),
				},
			},
		);
		expect(cancelRes.status).toBe(200);
		expect(await cancelRes.text()).toBe("ok");

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
		expect((row as any)?.status).toBe("cancelled");
	});

	it("re-dispatches a delivery whose prior attempt failed", async () => {
		const t = convexTest(schema, modules);
		const { encrypt } = await import("../lib/crypto");
		const secret = await encrypt("test-secret");
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_a", "viator", secret),
		);

		// Seed the delivery row a failed first attempt would leave
		// behind — the provider's retry must re-dispatch, not be acked
		// as a duplicate.
		await t.run(async (ctx) => {
			await ctx.db.insert("webhookDeliveries", {
				organizationId: "org_a",
				source: "viator",
				eventId: "booking.created:RES-FAC-001",
				eventType: "booking.created",
				status: "failed",
				payload: {},
				receivedAt: Date.now() - 60_000,
				attemptCount: 1,
			});
		});

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

		// The retry dispatched — the booking exists now.
		const rows = await t.run(async (ctx) =>
			ctx.db.query("otaBookings").collect(),
		);
		expect(rows.length).toBe(1);
		expect((rows[0] as any).otaReservationId).toBe("RES-FAC-001");
	});

	it("re-emitted booking.created after a cancel re-confirms instead of deduping (F89)", async () => {
		const t = convexTest(schema, modules);
		const { encrypt } = await import("../lib/crypto");
		const secret = await encrypt("test-secret");
		const integrationId = await t.run(async (ctx) =>
			seedIntegration(ctx, "org_a", "viator", secret),
		);

		const post = async (body: string) => {
			const sig = await hmacHex("test-secret", body);
			return t.fetch(`${WEBHOOK_PATH}?integrationId=${integrationId}`, {
				method: "POST",
				body,
				headers: {
					"x-viator-signature": sig,
					"x-viator-timestamp": String(Date.now()),
				},
			});
		};
		const bookingRow = () =>
			t.run(async (ctx) =>
				ctx.db
					.query("otaBookings")
					.withIndex("by_integration_reservation", (q: any) =>
						q
							.eq("integrationId", integrationId)
							.eq("otaReservationId", "RES-FAC-001"),
					)
					.unique(),
			);

		const createBody = JSON.stringify(VIATOR_BOOKING_PAYLOAD);
		const cancelBody = JSON.stringify(VIATOR_CANCEL_PAYLOAD);

		// 1. Create delivers and confirms.
		expect((await post(createBody)).status).toBe(200);
		expect(((await bookingRow()) as any)?.status).toBe("confirmed");

		// 2. A true duplicate retry while still confirmed is dropped.
		const dup = await post(createBody);
		expect(await dup.text()).toBe("ok (duplicate)");

		// 3. Cancel flips the row.
		expect((await post(cancelBody)).status).toBe(200);
		const cancelled = (await bookingRow()) as any;
		expect(cancelled?.status).toBe("cancelled");
		expect(cancelled?.cancelledAt).toBeDefined();

		// 4. Re-emitted create hits the completed-dedup key but the
		// booking is cancelled — it's a re-confirmation and must reach
		// upsertOtaBooking to clear cancelledAt, not be acked away.
		const reconfirm = await post(createBody);
		expect(await reconfirm.text()).toBe("ok");
		const reconfirmed = (await bookingRow()) as any;
		expect(reconfirmed?.status).toBe("confirmed");
		expect(reconfirmed?.cancelledAt).toBeUndefined();
	});
});

describe("extractEventId — availability.update dedup key (F55)", () => {
	it("identical retry payloads collapse to one eventId", () => {
		const a = extractEventId({
			kind: "availability.update",
			productId: "P-1",
			date: "2026-08-01",
			rawPayload: { seats: 5 },
		} as never);
		const b = extractEventId({
			kind: "availability.update",
			productId: "P-1",
			date: "2026-08-01",
			rawPayload: { seats: 5 },
		} as never);
		expect(a).toBe(b);
	});

	it("a CHANGED payload for the same product/date is not deduped", () => {
		const a = extractEventId({
			kind: "availability.update",
			productId: "P-1",
			date: "2026-08-01",
			rawPayload: { seats: 5 },
		} as never);
		const b = extractEventId({
			kind: "availability.update",
			productId: "P-1",
			date: "2026-08-01",
			rawPayload: { seats: 3 },
		} as never);
		// Previously keyed on productId+date only — a second update for
		// the same slot deduped against the first and never dispatched.
		expect(a).not.toBe(b);
	});
});

// silence unused-import warning for internal (referenced for type info)
void internal;