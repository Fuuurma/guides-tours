import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function seedTemplate(
	ctx: any,
	orgId: string,
	overrides: Record<string, any> = {},
) {
	return await ctx.db.insert("tourTemplates", {
		organizationId: orgId,
		name: "Old Town Walk Template",
		description: "",
		durationHours: 2,
		capacity: 10,
		tourType: "walking",
		languages: ["en"],
		inclusions: [],
		exclusions: [],
		highlights: [],
		minGuests: 1,
		maxGuests: 10,
		bookingCutoffHours: 24,
		requiredGuides: 1,
		isActive: true,
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	});
}

describe("tour templates", () => {
	it("create: stores template with audit log", async () => {
		const t = convexTest(schema, modules);
		const id = await t.mutation(internal.tourTemplates.internalCreate, {
			organizationId: "org_t1",
			userId: "user-1",
			name: "Old Town Walk",
			durationHours: 2,
			capacity: 10,
			tourType: "walking",
			languages: ["en"],
		});
		expect(id).toBeDefined();
		const logs = (await t.run((ctx) => ctx.db.query("auditLogs").collect())) as any;
		expect(logs[0]?.action).toBe("tour_template.created");
	});

	it("create: rejects capacity <= 0", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(internal.tourTemplates.internalCreate, {
				organizationId: "org_t2",
				userId: "user-1",
				name: "Bad",
				durationHours: 2,
				capacity: 0,
				tourType: "walking",
				languages: ["en"],
			}),
		).rejects.toThrow(/Capacity must be positive/);
	});

	it("update: patches fields", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_t3";
		const id = await t.run((ctx) => seedTemplate(ctx, orgId));
		await t.mutation(internal.tourTemplates.internalUpdate, {
			organizationId: orgId,
			userId: "user-1",
			templateId: id,
			name: "Renamed Template",
			capacity: 20,
		});
		const tmpl = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(tmpl?.name).toBe("Renamed Template");
		expect(tmpl?.capacity).toBe(20);
	});

	it("update: rejects wrong organization", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) => seedTemplate(ctx, "org_t4a"));
		await expect(
			t.mutation(internal.tourTemplates.internalUpdate, {
				organizationId: "org_t4b",
				userId: "user-1",
				templateId: id,
				name: "hack",
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("remove: deletes template and writes audit log", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_t5";
		const id = await t.run((ctx) => seedTemplate(ctx, orgId));
		await t.mutation(internal.tourTemplates.internalRemove, {
			organizationId: orgId,
			userId: "user-1",
			templateId: id,
		});
		const tmpl = await t.run((ctx) => ctx.db.get(id));
		expect(tmpl).toBeNull();
		const logs = (await t.run((ctx) =>
			ctx.db.query("auditLogs").collect(),
		)) as any;
		expect(logs.some((l: any) => l.action === "tour_template.deleted")).toBe(true);
	});

	describe("instantiate currency (F734)", () => {
		async function instantiateFor(orgId: string, defaultCurrency?: string) {
			const t = convexTest(schema, modules);
			const templateId = await t.run(async (ctx) => {
				if (defaultCurrency !== undefined) {
					await ctx.db.insert("paymentSettings", {
						organizationId: orgId,
						stripeEnabled: false,
						stripePublishableKey: "",
						stripeSecretKey: "",
						stripeWebhookSecret: "",
						stripeIsSandbox: true,
						acceptDeposits: false,
						depositPercentage: 0,
						defaultCurrency,
						createdAt: 0,
						updatedAt: 0,
					});
				}
				return seedTemplate(ctx, orgId);
			});
			const tourId = await t.mutation(internal.tourTemplates.internalInstantiate, {
				organizationId: orgId,
				userId: "user-1",
				templateId,
			});
			return (await t.run((ctx) => ctx.db.get(tourId))) as any;
		}

		it("inherits the org's payment currency instead of a fabricated USD", async () => {
			const tour = await instantiateFor("org_tpl_eur", "EUR");
			expect(tour?.currency).toBe("EUR");
		});

		it("falls back to USD when the org has no payment settings", async () => {
			const tour = await instantiateFor("org_tpl_none");
			expect(tour?.currency).toBe("USD");
		});
	});
});
