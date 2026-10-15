// Schema invariants, asserted against the schema Convex actually builds.
//
// `schema.export()` is the JSON Convex deploys: every table, its document
// validator, and its indexes. Reading it instead of regex-scanning
// schema.ts means a commented-out field, a renamed alias, or an index
// declared on the wrong table fails here — the text-scan version passed
// all three.

import { describe, expect, it } from "vitest";
import schema from "../../schema";

type FieldType = { type: string; value?: unknown };
type Field = { fieldType: FieldType; optional: boolean };
type ExportedTable = {
	tableName: string;
	indexes: Array<{ indexDescriptor: string; fields: string[] }>;
	documentType: { type: "object"; value: Record<string, Field> };
};

// export() is typed internal but is the exact payload `convex deploy` sends;
// if a Convex upgrade removes it, this line throws rather than passing.
const exported = JSON.parse(
	(schema as unknown as { export(): string }).export(),
) as { tables: ExportedTable[] };
const tables = new Map(exported.tables.map((t) => [t.tableName, t]));

// Tenant data that must never exist without an organization.
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

// Untyped payloads are allowed only where the shape is genuinely foreign
// (raw OTA bodies, webhook payloads, audit diffs).
const ALLOWLIST_ANY = new Set([
	"otaBookings.rawOtaData",
	"webhookDeliveries.payload",
	"auditLogs.oldValues",
	"auditLogs.newValues",
]);

/** Every field path in a validator, with its type node. */
function* fieldsOf(
	node: FieldType,
	path: string,
): Generator<{ path: string; name: string; type: FieldType }> {
	if (node.type === "object" && node.value) {
		for (const [name, field] of Object.entries(node.value as Record<string, Field>)) {
			const child = `${path}.${name}`;
			yield { path: child, name, type: field.fieldType };
			yield* fieldsOf(field.fieldType, child);
		}
	} else if (node.type === "union") {
		for (const member of node.value as FieldType[]) yield* fieldsOf(member, path);
	} else if (node.type === "array") {
		yield* fieldsOf(node.value as FieldType, `${path}[]`);
	}
}

function allFields() {
	return exported.tables.flatMap((t) => [...fieldsOf(t.documentType, t.tableName)]);
}

describe("convex/schema", () => {
	it("every tenant table exists and requires a string organizationId", () => {
		const problems: string[] = [];
		for (const name of REQUIRED_TABLES) {
			const org = tables.get(name)?.documentType.value.organizationId;
			if (!tables.has(name)) problems.push(`${name}: table missing`);
			else if (!org) problems.push(`${name}: no organizationId`);
			else if (org.optional || org.fieldType.type !== "string")
				problems.push(`${name}: organizationId is ${JSON.stringify(org)}`);
		}
		expect(problems).toEqual([]);
	});

	it("required indexes exist, and by_org* indexes lead with organizationId", () => {
		const problems: string[] = [];
		for (const { table, index } of REQUIRED_INDEXES) {
			const found = tables.get(table)?.indexes.find((i) => i.indexDescriptor === index);
			if (!found) problems.push(`${table}.${index}: missing`);
		}
		for (const t of exported.tables) {
			for (const i of t.indexes) {
				if (i.indexDescriptor.startsWith("by_org") && i.fields[0] !== "organizationId")
					problems.push(`${t.tableName}.${i.indexDescriptor}: leads with ${i.fields[0]}`);
			}
		}
		expect(problems).toEqual([]);
	});

	it("every *Cents money field is an int64, never a float", () => {
		const cents = allFields().filter((f) => f.name.endsWith("Cents"));
		expect(cents.length).toBeGreaterThan(0);
		expect(cents.filter((f) => f.type.type !== "bigint").map((f) => f.path)).toEqual([]);
	});

	it("v.any() appears only on the allowlisted payload fields", () => {
		const untyped = allFields()
			.filter((f) => f.type.type === "any")
			.map((f) => f.path);
		expect(untyped.filter((p) => !ALLOWLIST_ANY.has(p))).toEqual([]);
	});
});
