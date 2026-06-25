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
	return await ctx.db.insert("notificationTemplates", {
		organizationId: orgId,
		name: "24h Reminder",
		templateType: "reminder_24h",
		channel: "email",
		isActive: true,
		isDefault: false,
		emailSubject: "Your tour is tomorrow",
		emailBodyText: "Hi {{customerName}}, ...",
		emailBodyHtml: "<p>Hi {{customerName}}, ...</p>",
		smsBody: "",
		variables: ["customerName", "tourName", "date", "startTime"],
		sendTiming: "24h_before",
		requireConsent: false,
		retryOnFailure: true,
		retryCount: 3,
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	});
}

describe("notification templates", () => {
	it("create: stores template with audit log", async () => {
		const t = convexTest(schema, modules);
		const id = await t.mutation(
			internal.notificationTemplates.internalCreate,
			{
				organizationId: "org_nt1",
				name: "Booking Confirmed",
				templateType: "booking_confirmation",
				channel: "email",
				emailSubject: "Booking confirmed",
				emailBodyText: "Your booking is confirmed.",
				sendTiming: "immediate",
			},
		);
		expect(id).toBeDefined();
		const logs = (await t.run((ctx) =>
			ctx.db.query("auditLogs").collect(),
		)) as any;
		expect(logs[0]?.action).toBe("notification_template.created");
	});

	it("create: defaults isActive=true, isDefault=false, retryCount=3", async () => {
		const t = convexTest(schema, modules);
		const id = await t.mutation(
			internal.notificationTemplates.internalCreate,
			{
				organizationId: "org_nt2",
				name: "T",
				templateType: "reminder_2h",
				channel: "both",
				emailSubject: "subj",
				emailBodyText: "txt",
				sendTiming: "2h_before",
			},
		);
		const tpl = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(tpl?.isActive).toBe(true);
		expect(tpl?.isDefault).toBe(false);
		expect(tpl?.retryCount).toBe(3);
	});

	it("update: patches fields", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_nt3";
		const id = await t.run((ctx) => seedTemplate(ctx, orgId));
		await t.mutation(internal.notificationTemplates.internalUpdate, {
			organizationId: orgId,
			userId: "user-1",
			templateId: id,
			emailSubject: "Updated subject",
			isActive: false,
		});
		const tpl = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(tpl?.emailSubject).toBe("Updated subject");
		expect(tpl?.isActive).toBe(false);
	});

	it("update: rejects wrong organization", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) => seedTemplate(ctx, "org_nt4a"));
		await expect(
			t.mutation(internal.notificationTemplates.internalUpdate, {
				organizationId: "org_nt4b",
				userId: "user-1",
				templateId: id,
				emailSubject: "hacked",
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("remove: deletes template and writes audit log", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_nt5";
		const id = await t.run((ctx) => seedTemplate(ctx, orgId));
		await t.mutation(internal.notificationTemplates.internalRemove, {
			organizationId: orgId,
			userId: "user-1",
			templateId: id,
		});
		const tpl = await t.run((ctx) => ctx.db.get(id));
		expect(tpl).toBeNull();
		const logs = (await t.run((ctx) =>
			ctx.db.query("auditLogs").collect(),
		)) as any;
		expect(
			logs.some((l: any) => l.action === "notification_template.deleted"),
		).toBe(true);
	});
});
