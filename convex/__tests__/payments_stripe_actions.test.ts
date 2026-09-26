// Tests for convex/payments_stripe_actions.ts — Stripe API actions.
//
// These are the most security-critical payment flows:
//   - createCheckoutSession (dashboard Payment Element)
//   - createPublicPaymentIntent (public Payment Element)
//   - createHostedCheckout (dashboard hosted Checkout)
//   - createPublicHostedCheckout (public hosted Checkout)
//   - refundViaStripe (dashboard refund)
//
// Approach:
//   - Mock ../auth and ../lib/authz to bypass Better Auth (same
//     limitation as organizations.test.ts — the adapter can't resolve
//     sessions in convex-test).
//   - Mock ../lib/crypto so encrypt/decrypt are no-ops (avoids needing
//     a real ENCRYPTION_KEY for seeded payment settings).
//   - Mock globalThis.fetch to simulate Stripe API responses.
//   - Seed bookings, customers, and paymentSettings directly in the DB.

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.{ts,tsx}");

// ---- Hoisted mock state ----------------------------------------------------

const { mockState } = vi.hoisted(() => ({
	mockState: {
		member: null as {
			userId: string;
			organizationId: string;
			role: string;
		} | null,
		fetchResponse: null as {
			ok: boolean;
			status: number;
			json: () => Promise<unknown>;
			text: () => Promise<string>;
		} | null,
		fetchCalls: [] as Array<{ url: string; method: string; body?: string }>,
	},
}));

// Mock auth so requireRole returns our controlled member.
vi.mock("../auth", () => ({
	authComponent: {
		getAuthUser: async () => ({ _id: mockState.member?.userId ?? "u1" }),
		safeGetAuthUser: async () => ({ _id: mockState.member?.userId ?? "u1" }),
		getAuth: async () => ({
			auth: {
				api: {
					getSession: async () =>
						mockState.member
							? { session: { activeOrganizationId: mockState.member.organizationId }, user: { _id: mockState.member.userId } }
							: null,
					listOrganizations: async () => [],
					listMembers: async () => ({ members: [] }),
				},
			},
			headers: new Headers(),
		}),
	},
	createAuth: (() => ({})) as never,
	createAuthOptions: (() => ({
		database: {},
		emailAndPassword: { enabled: true, requireEmailVerification: true },
	})) as never,
}));

vi.mock("../lib/authz", () => ({
	requireMembership: async () => {
		if (!mockState.member) throw new Error("Unauthorized");
		return mockState.member;
	},
	requireRole: async (_ctx: unknown, _roles: string[]) => {
		if (!mockState.member) throw new Error("Unauthorized");
		return mockState.member;
	},
	getActiveMembership: async () => {
		if (!mockState.member) throw new Error("Unauthorized");
		return mockState.member;
	},
}));

vi.mock("../lib/crypto", () => ({
	encrypt: vi.fn(async (plaintext: string) => `enc:${plaintext}`),
	decrypt: vi.fn(async (ciphertext: string) =>
		ciphertext.startsWith("enc:") ? ciphertext.slice(4) : ciphertext,
	),
}));

// ---- Seed helpers ----------------------------------------------------------

type TestCtx = {
	db: {
		insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
	};
};

async function seedTour(ctx: TestCtx, orgId: string): Promise<Id<"tours">> {
	return (await ctx.db.insert("tours", {
		organizationId: orgId,
		name: "Test Tour",
		description: "",
		durationHours: 2,
		isActive: true,
		recurrenceType: "none",
		recurrenceDaysOfWeek: [],
		capacity: 10,
		bufferMinutes: 15,
		minGuests: 1,
		maxGuests: 10,
		bookingCutoffHours: 24,
		tourType: "walking",
		languages: ["en"],
		requiredGuides: 1,
		inclusions: [],
		exclusions: [],
		highlights: [],
		currency: "USD",
		createdAt: 0,
		updatedAt: 0,
	})) as Id<"tours">;
}

async function seedBooking(
	ctx: TestCtx,
	orgId: string,
	overrides: Partial<{
		totalAmountCents: bigint;
		balanceDueCents: bigint;
		status: string;
		customerEmail: string;
	}> = {},
): Promise<Id<"bookings">> {
	const tourId = await seedTour(ctx, orgId);
	const customerId = (await ctx.db.insert("customers", {
		organizationId: orgId,
		name: "Alice",
		email: overrides.customerEmail ?? "alice@example.com",
		phone: "",
		notes: "",
		smsConsent: false,
		emailConsent: false,
		preferredLanguage: "en",
		tags: [],
		source: "",
		sourceDetails: "",
		specialRequirements: "",
		vipStatus: false,
		loyaltyPoints: 0,
		totalVisits: 0,
		totalRevenueCents: 0n,
		createdAt: 0,
		updatedAt: 0,
	})) as Id<"customers">;
	const total = overrides.totalAmountCents ?? 10000n;
	return (await ctx.db.insert("bookings", {
		organizationId: orgId,
		tourId,
		customerId,
		date: "2026-09-01",
		startTime: "09:00",
		guests: 2,
		guestNames: "",
		languageRequired: "",
		notes: "",
		status: overrides.status ?? "pending",
		depositAmountCents: 0n,
		totalAmountCents: total,
		balanceDueCents: overrides.balanceDueCents ?? total,
		paymentMethod: "",
		checkedInAt: undefined,
		checkedInBy: "",
		completedAt: undefined,
		netRevenueCents: total,
		source: "direct",
		reviewRating: undefined,
		reviewComment: "",
		createdAt: 0,
		updatedAt: 0,
	})) as Id<"bookings">;
}

async function seedPaymentSettings(
	ctx: TestCtx,
	orgId: string,
	overrides: Partial<{
		stripeEnabled: boolean;
		stripeSecretKey: string;
		stripeWebhookSecret: string;
		stripePublishableKey: string;
	}> = {},
) {
	await ctx.db.insert("paymentSettings", {
		organizationId: orgId,
		stripeEnabled: overrides.stripeEnabled ?? true,
		stripePublishableKey: overrides.stripePublishableKey ?? "pk_test_123",
		stripeSecretKey: overrides.stripeSecretKey ?? "enc:sk_test_123",
		stripeWebhookSecret: overrides.stripeWebhookSecret ?? "enc:whsec_123",
		stripeIsSandbox: true,
		acceptDeposits: false,
		depositPercentage: 0,
		defaultCurrency: "USD",
		createdAt: 0,
		updatedAt: 0,
	});
}

async function seedPayment(
	ctx: TestCtx,
	orgId: string,
	bookingId: Id<"bookings">,
	overrides: Partial<{
		stripePaymentIntentId: string;
		status: string;
		amountCents: bigint;
		createdAt: number;
	}> = {},
): Promise<Id<"payments">> {
	return (await ctx.db.insert("payments", {
		organizationId: orgId,
		bookingId,
		stripePaymentIntentId: overrides.stripePaymentIntentId ?? "pi_test_123",
		amountCents: overrides.amountCents ?? 10000n,
		currency: "USD",
		status: overrides.status ?? "succeeded",
		provider: "stripe",
		createdAt: overrides.createdAt ?? 0,
		updatedAt: 0,
	})) as Id<"payments">;
}

// ---- Fetch mock helper -----------------------------------------------------

function mockFetchSuccess(body: unknown) {
	mockState.fetchResponse = {
		ok: true,
		status: 200,
		json: async () => body,
		text: async () => JSON.stringify(body),
	};
}

function mockFetchError(status: number, message: string) {
	mockState.fetchResponse = {
		ok: false,
		status,
		json: async () => ({ error: { message } }),
		text: async () => message,
	};
}

// ---- Tests -----------------------------------------------------------------

describe("payments_stripe_actions — createCheckoutSession", () => {
	beforeEach(() => {
		mockState.fetchCalls = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, opts: { method?: string; body?: unknown }) => {
				mockState.fetchCalls.push({
					url: String(url),
					method: opts?.method ?? "GET",
					body: typeof opts?.body === "string" ? opts.body : undefined,
				});
				if (!mockState.fetchResponse) throw new Error("fetch response not set");
				return mockState.fetchResponse;
			}),
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		mockState.member = null;
		mockState.fetchResponse = null;
	});

	it("creates a PaymentIntent and records the payment", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_stripe_1";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockState.member = { userId: "u1", organizationId: orgId, role: "owner" };
		mockFetchSuccess({
			id: "pi_test_new_1",
			client_secret: "pi_test_new_1_secret_abc",
			amount: 5000,
			currency: "usd",
		});

		const result = await t.action(api.payments_stripe_actions.createCheckoutSession, {
			bookingId,
			amountCents: 5000n,
		});

		expect(result.stripePaymentIntentId).toBe("pi_test_new_1");
		expect(result.clientSecret).toBe("pi_test_new_1_secret_abc");
		expect(result.amountCents).toBe(5000n);
		expect(result.currency).toBe("USD");
		expect(result.publishableKey).toBe("pk_test_123");
		expect(mockState.fetchCalls).toHaveLength(1);
		expect(mockState.fetchCalls[0]?.url).toContain("/payment_intents");
	});

	it("rejects cross-org booking access", async () => {
		const t = convexTest(schema, modules);
		const orgA = "org_stripe_a";
		const orgB = "org_stripe_b";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgA),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgA),
		);
		// Member is in orgB, booking is in orgA
		mockState.member = { userId: "u1", organizationId: orgB, role: "owner" };
		mockFetchSuccess({ id: "pi_x", client_secret: "cs_x" });

		await expect(
			t.action(api.payments_stripe_actions.createCheckoutSession, {
				bookingId,
				amountCents: 5000n,
			}),
		).rejects.toThrow(/Forbidden.*wrong organization/i);
	});

	it("rejects amount exceeding balance due", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_stripe_3";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId, {
				totalAmountCents: 5000n,
				balanceDueCents: 5000n,
			}),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockState.member = { userId: "u1", organizationId: orgId, role: "owner" };

		await expect(
			t.action(api.payments_stripe_actions.createCheckoutSession, {
				bookingId,
				amountCents: 10000n, // exceeds balance of 5000
			}),
		).rejects.toThrow(/exceeds balance due/i);
	});

	it("rejects when Stripe is not configured", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_stripe_4";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		// No payment settings seeded — Stripe not configured
		mockState.member = { userId: "u1", organizationId: orgId, role: "owner" };

		await expect(
			t.action(api.payments_stripe_actions.createCheckoutSession, {
				bookingId,
				amountCents: 5000n,
			}),
		).rejects.toThrow(/Stripe is not configured/i);
	});

	it("rejects when Stripe API returns an error", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_stripe_5";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockState.member = { userId: "u1", organizationId: orgId, role: "owner" };
		mockFetchError(400, "Invalid amount");

		await expect(
			t.action(api.payments_stripe_actions.createCheckoutSession, {
				bookingId,
				amountCents: 5000n,
			}),
		).rejects.toThrow(/Stripe error.*400/i);
	});

	it("rejects unauthenticated users", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_stripe_6";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockState.member = null;

		await expect(
			t.action(api.payments_stripe_actions.createCheckoutSession, {
				bookingId,
				amountCents: 5000n,
			}),
		).rejects.toThrow(/Unauthorized/i);
	});
});

describe("payments_stripe_actions — createPublicPaymentIntent", () => {
	beforeEach(() => {
		mockState.fetchCalls = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, opts: { method?: string; body?: unknown }) => {
				mockState.fetchCalls.push({
					url: String(url),
					method: opts?.method ?? "GET",
					body: typeof opts?.body === "string" ? opts.body : undefined,
				});
				if (!mockState.fetchResponse) throw new Error("fetch response not set");
				return mockState.fetchResponse;
			}),
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		mockState.member = null;
		mockState.fetchResponse = null;
	});

	it("creates a PI for the full balance when email matches", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_pi_1";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId, {
				customerEmail: "guest@example.com",
				totalAmountCents: 8000n,
				balanceDueCents: 8000n,
			}),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockFetchSuccess({
			id: "pi_pub_1",
			client_secret: "pi_pub_1_secret",
			amount: 8000,
			currency: "usd",
		});

		const result = await t.action(api.payments_stripe_actions.createPublicPaymentIntent, {
			bookingId,
			customerEmail: "guest@example.com",
		});

		expect(result.stripePaymentIntentId).toBe("pi_pub_1");
		expect(result.amountCents).toBe(8000n);
	});

	it("re-opens the booking's pending intent instead of minting (F375)", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_pi_reuse";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId, {
				customerEmail: "guest@example.com",
				totalAmountCents: 8000n,
				balanceDueCents: 8000n,
			}),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedPayment(ctx as unknown as TestCtx, orgId, bookingId, {
				stripePaymentIntentId: "pi_open_1",
				status: "pending",
				amountCents: 8000n,
				createdAt: Date.now(),
			}),
		);
		mockFetchSuccess({
			id: "pi_open_1",
			client_secret: "pi_open_1_secret",
			amount: 8000,
			currency: "usd",
			status: "requires_payment_method",
		});

		const result = await t.action(api.payments_stripe_actions.createPublicPaymentIntent, {
			bookingId,
			customerEmail: "guest@example.com",
		});

		// Same intent handed back — the client resumes it, no new mint.
		expect(result.stripePaymentIntentId).toBe("pi_open_1");
		expect(result.clientSecret).toBe("pi_open_1_secret");
		// Only the GET verify ran — no POST /payment_intents.
		const posts = mockState.fetchCalls.filter((c) => c.method === "POST");
		expect(posts).toHaveLength(0);
	});

	it("mints fresh when the stored intent is stale-priced (F375)", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_pi_stale";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId, {
				customerEmail: "guest@example.com",
				totalAmountCents: 8000n,
				balanceDueCents: 8000n,
			}),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedPayment(ctx as unknown as TestCtx, orgId, bookingId, {
				stripePaymentIntentId: "pi_stale_1",
				status: "pending",
				amountCents: 5000n, // balance moved since this intent was minted
				createdAt: Date.now(),
			}),
		);
		mockFetchSuccess({
			id: "pi_fresh_1",
			client_secret: "pi_fresh_1_secret",
			amount: 8000,
			currency: "usd",
			status: "succeeded",
		});

		const result = await t.action(api.payments_stripe_actions.createPublicPaymentIntent, {
			bookingId,
			customerEmail: "guest@example.com",
		});

		expect(result.stripePaymentIntentId).toBe("pi_fresh_1");
		const posts = mockState.fetchCalls.filter((c) => c.method === "POST");
		expect(posts).toHaveLength(1);
	});

	it("rate-limits repeated public payment attempts (F375)", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_pi_rl";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId, {
				customerEmail: "guest@example.com",
				totalAmountCents: 8000n,
				balanceDueCents: 8000n,
			}),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		// status succeeded → every call takes the mint path, so each
		// attempt consumes one rate-limit slot.
		mockFetchSuccess({
			id: "pi_rl_1",
			client_secret: "pi_rl_1_secret",
			amount: 8000,
			currency: "usd",
			status: "succeeded",
		});

		for (let i = 0; i < 5; i++) {
			await t.action(api.payments_stripe_actions.createPublicPaymentIntent, {
				bookingId,
				customerEmail: "guest@example.com",
			});
		}
		await expect(
			t.action(api.payments_stripe_actions.createPublicPaymentIntent, {
				bookingId,
				customerEmail: "guest@example.com",
			}),
		).rejects.toThrow(/Too many payment attempts/i);
	});

	it("rejects when email does not match booking", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_pi_2";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId, {
				customerEmail: "real@example.com",
			}),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);

		await expect(
			t.action(api.payments_stripe_actions.createPublicPaymentIntent, {
				bookingId,
				customerEmail: "wrong@example.com",
			}),
		).rejects.toThrow(/Email does not match/i);
	});

	it("rejects when Stripe is disabled for public payments", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_pi_3";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId, {
				customerEmail: "guest@example.com",
			}),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId, {
				stripeEnabled: false,
			}),
		);

		await expect(
			t.action(api.payments_stripe_actions.createPublicPaymentIntent, {
				bookingId,
				customerEmail: "guest@example.com",
			}),
		).rejects.toThrow(/not available/i);
	});

	it("rejects invalid email", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_pi_4";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);

		await expect(
			t.action(api.payments_stripe_actions.createPublicPaymentIntent, {
				bookingId,
				customerEmail: "not-an-email",
			}),
		).rejects.toThrow(/Invalid email/i);
	});
});

describe("payments_stripe_actions — createHostedCheckout", () => {
	beforeEach(() => {
		vi.stubEnv("SITE_URL", "https://guides-tours.example");
		mockState.fetchCalls = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, opts: { method?: string; body?: unknown }) => {
				mockState.fetchCalls.push({
					url: String(url),
					method: opts?.method ?? "GET",
					body: typeof opts?.body === "string" ? opts.body : undefined,
				});
				if (!mockState.fetchResponse) throw new Error("fetch response not set");
				return mockState.fetchResponse;
			}),
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		mockState.member = null;
		mockState.fetchResponse = null;
	});

	it("creates a Checkout session with URL", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_hosted_1";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockState.member = { userId: "u1", organizationId: orgId, role: "owner" };
		mockFetchSuccess({
			id: "cs_test_1",
			url: "https://checkout.stripe.com/c/pay/cs_test_1",
			payment_intent: "pi_hosted_1",
		});

		const result = await t.action(api.payments_stripe_actions.createHostedCheckout, {
			bookingId,
		});

		expect(result.url).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
		expect(result.sessionId).toBe("cs_test_1");
		expect(mockState.fetchCalls[0]?.url).toContain("/checkout/sessions");
		const body = new URLSearchParams(mockState.fetchCalls[0]?.body);
		expect(body.get("success_url")).toBe(
			`https://guides-tours.example/dashboard/bookings/${bookingId}?paid=1`,
		);
		expect(body.get("cancel_url")).toBe(
			`https://guides-tours.example/dashboard/bookings/${bookingId}`,
		);
	});

	it("rejects hosted Checkout return URLs that are not same-site paths", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_hosted_return_url";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockState.member = { userId: "u1", organizationId: orgId, role: "owner" };

		await expect(
			t.action(api.payments_stripe_actions.createHostedCheckout, {
				bookingId,
				successPath: "https://evil.example/done",
			}),
		).rejects.toThrow(/same-site path/i);
		expect(mockState.fetchCalls).toHaveLength(0);
	});

	it("rejects when session has no URL", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_hosted_2";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockState.member = { userId: "u1", organizationId: orgId, role: "owner" };
		mockFetchSuccess({ id: "cs_test_2", url: null });

		await expect(
			t.action(api.payments_stripe_actions.createHostedCheckout, {
				bookingId,
			}),
		).rejects.toThrow(/missing URL/i);
	});
});

describe("payments_stripe_actions — createPublicHostedCheckout", () => {
	beforeEach(() => {
		vi.stubEnv("SITE_URL", "https://guides-tours.example");
		mockState.fetchCalls = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, opts: { method?: string; body?: unknown }) => {
				mockState.fetchCalls.push({
					url: String(url),
					method: opts?.method ?? "GET",
					body: typeof opts?.body === "string" ? opts.body : undefined,
				});
				if (!mockState.fetchResponse) throw new Error("fetch response not set");
				return mockState.fetchResponse;
			}),
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		mockState.member = null;
		mockState.fetchResponse = null;
	});

	it("creates a public Checkout session when email matches", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_hosted_1";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId, {
				customerEmail: "guest@example.com",
			}),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockFetchSuccess({
			id: "cs_pub_1",
			url: "https://checkout.stripe.com/c/pay/cs_pub_1",
			payment_intent: "pi_pub_hosted_1",
		});

		const result = await t.action(api.payments_stripe_actions.createPublicHostedCheckout, {
			bookingId,
			customerEmail: "guest@example.com",
		});

		expect(result.url).toBe("https://checkout.stripe.com/c/pay/cs_pub_1");
		expect(result.sessionId).toBe("cs_pub_1");
		const body = new URLSearchParams(mockState.fetchCalls[0]?.body);
		expect(body.get("success_url")).toBe(
			`https://guides-tours.example/book/paid?bookingId=${bookingId}`,
		);
		expect(body.get("cancel_url")).toBe(
			`https://guides-tours.example/book/paid?bookingId=${bookingId}&cancelled=1`,
		);
	});

	it("attaches the booking's pending intent to the session (F375)", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_hosted_reuse";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId, {
				customerEmail: "guest@example.com",
				totalAmountCents: 8000n,
				balanceDueCents: 8000n,
			}),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedPayment(ctx as unknown as TestCtx, orgId, bookingId, {
				stripePaymentIntentId: "pi_hosted_open",
				status: "pending",
				amountCents: 8000n,
				createdAt: Date.now(),
			}),
		);
		// GET verify returns the open intent; POST session create returns
		// the session — one fixed object can't carry both ids, so branch
		// by URL (same pattern as the fallback test below).
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, opts: { method?: string; body?: unknown } = {}) => {
				mockState.fetchCalls.push({
					url: String(url),
					method: opts?.method ?? "GET",
					body: typeof opts?.body === "string" ? opts.body : undefined,
				});
				if (url.includes("/payment_intents/")) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							id: "pi_hosted_open",
							amount: 8000,
							currency: "usd",
							status: "requires_payment_method",
						}),
						text: async (): Promise<string> => "",
					};
				}
				return {
					ok: true,
					status: 200,
					json: async () => ({
						id: "cs_pub_reuse",
						url: "https://checkout.stripe.com/c/pay/cs_pub_reuse",
						payment_intent: "pi_hosted_open",
					}),
					text: async (): Promise<string> => "",
				};
			}),
		);

		const result = await t.action(api.payments_stripe_actions.createPublicHostedCheckout, {
			bookingId,
			customerEmail: "guest@example.com",
		});

		expect(result.url).toContain("cs_pub_reuse");
		const create = mockState.fetchCalls.find(
			(c) => c.method === "POST" && c.url.includes("/checkout/sessions"),
		);
		const body = new URLSearchParams(create?.body);
		expect(body.get("payment_intent")).toBe("pi_hosted_open");
	});

	it("falls back to a fresh session when Stripe rejects the reused intent (F375)", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_hosted_fallback";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId, {
				customerEmail: "guest@example.com",
				totalAmountCents: 8000n,
				balanceDueCents: 8000n,
			}),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedPayment(ctx as unknown as TestCtx, orgId, bookingId, {
				stripePaymentIntentId: "pi_hosted_stale",
				status: "pending",
				amountCents: 8000n,
				createdAt: Date.now(),
			}),
		);
		// Sequence: GET verify → open; POST with payment_intent → 400;
		// POST without → session. The stub reads mockState per call, and
		// this test drives the branch by URL/body (GET vs POST#1 vs POST#2).
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, opts: { method?: string; body?: unknown } = {}) => {
				mockState.fetchCalls.push({
					url: String(url),
					method: opts?.method ?? "GET",
					body: typeof opts?.body === "string" ? opts.body : undefined,
				});
				if (url.includes("/payment_intents/")) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							id: "pi_hosted_stale",
							amount: 8000,
							currency: "usd",
							status: "requires_payment_method",
						}),
						text: async (): Promise<string> => "",
					};
				}
				const body = typeof opts?.body === "string" ? opts.body : "";
				if (new URLSearchParams(body).get("payment_intent")) {
					return {
						ok: false,
						status: 400,
						json: async () => ({
							error: { message: "payment_intent is not attachable" },
						}),
						text: async (): Promise<string> => "payment_intent is not attachable",
					};
				}
				return {
					ok: true,
					status: 200,
					json: async () => ({
						id: "cs_fresh",
						url: "https://checkout.stripe.com/c/pay/cs_fresh",
						payment_intent: "pi_new_fresh",
					}),
					text: async (): Promise<string> => "",
				};
			}),
		);

		const result = await t.action(api.payments_stripe_actions.createPublicHostedCheckout, {
			bookingId,
			customerEmail: "guest@example.com",
		});

		// First POST carried the reuse attempt, second did not.
		const posts = mockState.fetchCalls.filter(
			(c) => c.method === "POST" && c.url.includes("/checkout/sessions"),
		);
		expect(posts).toHaveLength(2);
		expect(
			new URLSearchParams(posts[0]?.body).get("payment_intent"),
		).toBe("pi_hosted_stale");
		expect(
			new URLSearchParams(posts[1]?.body).get("payment_intent"),
		).toBeNull();
		expect(result.sessionId).toBe("cs_fresh");
	});

	it("rejects public Checkout protocol-relative return URLs", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_hosted_return_url";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId, {
				customerEmail: "guest@example.com",
			}),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);

		await expect(
			t.action(api.payments_stripe_actions.createPublicHostedCheckout, {
				bookingId,
				customerEmail: "guest@example.com",
				cancelPath: "//evil.example/cancel",
			}),
		).rejects.toThrow(/same-site path/i);
		expect(mockState.fetchCalls).toHaveLength(0);
	});

	it("rejects when email does not match", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_hosted_2";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId, {
				customerEmail: "real@example.com",
			}),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);

		await expect(
			t.action(api.payments_stripe_actions.createPublicHostedCheckout, {
				bookingId,
				customerEmail: "wrong@example.com",
			}),
		).rejects.toThrow(/Email does not match/i);
	});
});

describe("payments_stripe_actions — refundViaStripe", () => {
	beforeEach(() => {
		mockState.fetchCalls = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, opts: { method?: string; body?: unknown }) => {
				mockState.fetchCalls.push({
					url: String(url),
					method: opts?.method ?? "GET",
					body: typeof opts?.body === "string" ? opts.body : undefined,
				});
				if (!mockState.fetchResponse) throw new Error("fetch response not set");
				return mockState.fetchResponse;
			}),
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		mockState.member = null;
		mockState.fetchResponse = null;
	});

	it("refunds a succeeded payment via Stripe API", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_refund_1";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		const paymentId = await t.run(async (ctx) =>
			seedPayment(ctx as unknown as TestCtx, orgId, bookingId, {
				stripePaymentIntentId: "pi_refund_1",
				status: "succeeded",
				amountCents: 10000n,
			}),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockState.member = { userId: "u1", organizationId: orgId, role: "owner" };
		mockFetchSuccess({
			id: "re_test_1",
			amount: 10000,
			currency: "usd",
			reason: "requested_by_customer",
			created: 1700000000,
		});

		const result = await t.action(api.payments_stripe_actions.refundViaStripe, {
			paymentId,
			reason: "Customer requested",
		});

		expect(result.paymentId).toBe(paymentId);
		expect(result.stripeRefundId).toBe("re_test_1");
		expect(mockState.fetchCalls[0]?.url).toContain("/refunds");
	});

	it("rejects refund of non-succeeded payment", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_refund_2";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		const paymentId = await t.run(async (ctx) =>
			seedPayment(ctx as unknown as TestCtx, orgId, bookingId, {
				status: "pending",
			}),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockState.member = { userId: "u1", organizationId: orgId, role: "owner" };

		await expect(
			t.action(api.payments_stripe_actions.refundViaStripe, {
				paymentId,
			}),
		).rejects.toThrow(/Only succeeded payments/i);
	});

	it("rejects cross-org refund", async () => {
		const t = convexTest(schema, modules);
		const orgA = "org_refund_a";
		const orgB = "org_refund_b";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgA),
		);
		const paymentId = await t.run(async (ctx) =>
			seedPayment(ctx as unknown as TestCtx, orgA, bookingId),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgA),
		);
		// Member in orgB, payment in orgA
		mockState.member = { userId: "u1", organizationId: orgB, role: "owner" };

		await expect(
			t.action(api.payments_stripe_actions.refundViaStripe, {
				paymentId,
			}),
		).rejects.toThrow(/Forbidden.*wrong organization/i);
	});

	it("rejects refund when Stripe API fails", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_refund_4";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		const paymentId = await t.run(async (ctx) =>
			seedPayment(ctx as unknown as TestCtx, orgId, bookingId),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockState.member = { userId: "u1", organizationId: orgId, role: "owner" };
		mockFetchError(400, "Refund failed");

		await expect(
			t.action(api.payments_stripe_actions.refundViaStripe, {
				paymentId,
			}),
		).rejects.toThrow(/Stripe refund error/i);
	});
});

describe("payments_stripe_actions — assertBookingCheckoutAllowed edge cases", () => {
	beforeEach(() => {
		mockState.fetchCalls = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				if (!mockState.fetchResponse) throw new Error("fetch response not set");
				return mockState.fetchResponse;
			}),
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		mockState.member = null;
		mockState.fetchResponse = null;
	});

	it("rejects payment for cancelled booking", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_edge_1";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId, { status: "cancelled" }),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockState.member = { userId: "u1", organizationId: orgId, role: "owner" };

		await expect(
			t.action(api.payments_stripe_actions.createCheckoutSession, {
				bookingId,
				amountCents: 5000n,
			}),
		).rejects.toThrow(/Cannot collect payment.*cancelled/i);
	});

	it("rejects zero amount", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_edge_2";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockState.member = { userId: "u1", organizationId: orgId, role: "owner" };

		await expect(
			t.action(api.payments_stripe_actions.createCheckoutSession, {
				bookingId,
				amountCents: 0n,
			}),
		).rejects.toThrow(/amount must be positive/i);
	});

	it("rejects payment for completed booking", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_edge_3";
		const bookingId = await t.run(async (ctx) =>
			seedBooking(ctx as unknown as TestCtx, orgId, { status: "completed" }),
		);
		await t.run(async (ctx) =>
			seedPaymentSettings(ctx as unknown as TestCtx, orgId),
		);
		mockState.member = { userId: "u1", organizationId: orgId, role: "owner" };

		await expect(
			t.action(api.payments_stripe_actions.createCheckoutSession, {
				bookingId,
				amountCents: 5000n,
			}),
		).rejects.toThrow(/Cannot collect payment.*completed/i);
	});
});
