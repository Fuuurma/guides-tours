// Schema sanity tests — string-based scan of the schema file source.
//
// We don't talk to a real Convex deployment here — those happen when
// `npx convex dev` deploys the schema. These tests catch regressions
// early: a table removed from REQUIRED_TABLES without removing the
// tests, an index dropped, a tenant field accidentally deleted, etc.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCHEMA_PATH = resolve(__dirname, "../../schema.ts");
const source = readFileSync(SCHEMA_PATH, "utf8");

const REQUIRED_TABLES = [
	"availabilities",
	"vacationRequests",
	"tours",
	"tourCategories",
	"tourTemplates",
	"tourSchedules",
	"tourBlackoutDates",
	"tourSeasonalSchedules",
	"tourExceptionDates",
	"tourAnalytics",
	"tourImages",
	"vehicles",
	"drivers",
	"assignments",
	"customers",
	"bookings",
	"otaIntegrations",
	"otaProducts",
	"otaBookings",
	"otaAvailabilityCache",
	"otaRevenue",
	"payments",
	"paymentSettings",
	"notificationTemplates",
	"smsMessages",
	"emailMessages",
	"notificationLogs",
	"scheduledNotifications",
	"notificationSettings",
	"auditLogs",
	"files",
];

const REQUIRED_INDEXES: Array<{ table: string; index: string }> = [
	{ table: "availabilities", index: "by_org_user_date" },
	{ table: "vacationRequests", index: "by_org" },
	{ table: "tours", index: "by_org" },
	{ table: "tours", index: "by_org_active" },
	{ table: "tours", index: "by_org_category" },
	{ table: "tourCategories", index: "by_org_slug" },
	{ table: "tourTemplates", index: "by_org" },
	{ table: "tourSchedules", index: "by_org_date" },
	{ table: "tourBlackoutDates", index: "by_org_start" },
	{ table: "tourSeasonalSchedules", index: "by_org" },
	{ table: "tourExceptionDates", index: "by_org" },
	{ table: "tourAnalytics", index: "by_org_period" },
	{ table: "tourImages", index: "by_tour" },
	{ table: "vehicles", index: "by_org_status" },
	{ table: "drivers", index: "by_org" },
	{ table: "assignments", index: "by_org_date" },
	{ table: "assignments", index: "by_guide_date" },
	{ table: "customers", index: "by_org_email" },
	{ table: "bookings", index: "by_org_date" },
	{ table: "otaIntegrations", index: "by_org_provider" },
	{ table: "otaProducts", index: "by_integration" },
	{ table: "otaBookings", index: "by_integration_reservation" },
	{ table: "otaAvailabilityCache", index: "by_product_date" },
	{ table: "otaRevenue", index: "by_org_integration_period" },
	{ table: "payments", index: "by_stripe_intent" },
	{ table: "paymentSettings", index: "by_org" },
	{ table: "notificationTemplates", index: "by_org_type" },
	{ table: "scheduledNotifications", index: "by_sent_scheduled" },
	{ table: "notificationSettings", index: "by_org" },
	{ table: "auditLogs", index: "by_org_timestamp" },
];

/**
 * Extract full table blocks (defineTable + trailing .index chain).
 * Returns a map from table name to the full block text. The block
 * ends right before the next "tableName:" or the closing "});" of
 * defineSchema.
 */
function extractTableBlocks(src: string): Map<string, string> {
	const out = new Map<string, string>();
	const headerRe = /\b(\w+):\s*defineTable\(\{/g;
	const KNOWN = new Set([
		"availabilities",
		"vacationRequests",
		"tours",
		"tourCategories",
		"tourTemplates",
		"tourSchedules",
		"tourBlackoutDates",
		"tourSeasonalSchedules",
		"tourExceptionDates",
		"tourAnalytics",
		"tourImages",
		"vehicles",
		"drivers",
		"assignments",
		"customers",
		"bookings",
		"otaIntegrations",
		"otaProducts",
		"otaBookings",
		"otaAvailabilityCache",
		"otaRevenue",
		"payments",
		"paymentSettings",
		"notificationTemplates",
		"smsMessages",
		"emailMessages",
		"notificationLogs",
		"scheduledNotifications",
		"notificationSettings",
		"auditLogs",
		"files",
	]);
	let match: RegExpExecArray | null;
	while ((match = headerRe.exec(src)) !== null) {
		const tableName = match[1];
		if (!KNOWN.has(tableName)) continue;
		const blockStart = match.index;
		// Skip past the defineTable({...}) to find the start of .index chain
		const bodyStart = headerRe.lastIndex;
		let depth = 1;
		let i = bodyStart;
		while (i < src.length && depth > 0) {
			const ch = src[i];
			if (ch === "{") depth++;
			else if (ch === "}") depth--;
			i++;
		}
		// i sits just after the closing `}`.
		// Walk forward, skipping whitespace + comments, until we hit
		// the next "tableName:" or the schema's closing "});".
		// The .index chain ends at the next known table name or end.
		const remaining = src.slice(i);
		const nextTableRe = /\n\s*\n\s*(\w+):\s*defineTable\(/g;
		const nextMatch = nextTableRe.exec(remaining);
		const blockEnd = nextMatch ? i + nextMatch.index : src.length;
		const block = src.slice(blockStart, blockEnd);
		out.set(tableName, block);
		headerRe.lastIndex = i;
	}
	return out;
}

describe("convex/schema", () => {
	describe("tables", () => {
		for (const table of REQUIRED_TABLES) {
			it(`defines ${table}`, () => {
				const re = new RegExp(`\\b${table}:\\s*defineTable\\(`);
				expect(source, `missing table ${table}`).toMatch(re);
			});
		}
	});

	describe("tenant scoping", () => {
		const blocks = extractTableBlocks(source);

		for (const table of REQUIRED_TABLES) {
			it(`${table} has organizationId field`, () => {
				const block = blocks.get(table);
				expect(block, `could not find block for ${table}`).toBeDefined();
				expect(block, `${table} missing organizationId`).toMatch(
					/organizationId:\s*orgId/,
				);
			});
		}
	});

	describe("indexes", () => {
		const blocks = extractTableBlocks(source);

		for (const { table, index } of REQUIRED_INDEXES) {
			it(`${table} defines .index("${index}")`, () => {
				const block = blocks.get(table);
				expect(block, `could not find block for ${table}`).toBeDefined();
				const re = new RegExp(`\\.index\\(["']${index}["']`);
				expect(block, `${table} missing index "${index}"`).toMatch(re);
			});
		}
	});

	describe("encrypted field marker", () => {
		it("marks OTA API keys as encrypted", () => {
			expect(source).toMatch(/apiKey:\s*encryptedString/);
		});
		it("marks Stripe secret as encrypted", () => {
			expect(source).toMatch(/stripeSecretKey:\s*encryptedString/);
		});
		it("marks Stripe webhook secret as encrypted", () => {
			expect(source).toMatch(/stripeWebhookSecret:\s*encryptedString/);
		});
	});

	describe("money fields use cents-only", () => {
		it("no .amount/.revenue fields use v.number() (must be v.int64())", () => {
			const moneyFieldNames = [
				"totalAmountCents",
				"balanceDueCents",
				"netRevenueCents",
				"grossRevenueCents",
				"commissionAmountCents",
				"basePriceCents",
			];
			for (const field of moneyFieldNames) {
				const re = new RegExp(`${field}:\\s*v\\.number\\(\\)`);
				expect(
					source.match(re),
					`${field} should use v.int64() for cents, not v.number()`,
				).toBeNull();
			}
		});
	});
});
