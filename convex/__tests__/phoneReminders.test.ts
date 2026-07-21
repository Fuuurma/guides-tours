import { describe, expect, it } from "vitest";
import { formatPhoneReminder } from "../phoneReminders";

describe("formatPhoneReminder", () => {
	it("includes profile deep link and role context", () => {
		const msg = formatPhoneReminder({
			name: "Alex",
			profileUrl: "https://app.example.com/dashboard/guides/u1",
			roles: ["guide", "driver"],
			assignmentCount: 3,
			dateFrom: "2026-08-01",
			dateTo: "2026-08-14",
		});
		expect(msg.subject).toContain("Add your phone");
		expect(msg.bodyText).toContain("Alex");
		expect(msg.bodyText).toContain("3 upcoming");
		expect(msg.bodyText).toContain("guide / driver");
		expect(msg.bodyText).toContain(
			"https://app.example.com/dashboard/guides/u1",
		);
	});
});

describe("PHONE_REMIND_SEND_RETENTION_MS", () => {
	it("is longer than the per-user cooldown", async () => {
		const { PHONE_REMIND_SEND_RETENTION_MS } = await import(
			"../phoneReminders"
		);
		const { USER_COOLDOWN_MS } = await import("../lib/phoneRemindCooldown");
		expect(PHONE_REMIND_SEND_RETENTION_MS).toBeGreaterThan(USER_COOLDOWN_MS);
	});
});
