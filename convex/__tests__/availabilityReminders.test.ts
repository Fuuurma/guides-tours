import { describe, expect, it } from "vitest";
import {
	datesInRange,
	formatAvailabilityReminder,
	unmarkedDates,
} from "../availabilityReminders";

describe("datesInRange / unmarkedDates", () => {
	it("lists inclusive days", () => {
		expect(datesInRange("2026-08-01", "2026-08-03")).toEqual([
			"2026-08-01",
			"2026-08-02",
			"2026-08-03",
		]);
	});

	it("finds unmarked days", () => {
		expect(
			unmarkedDates(
				["2026-08-01", "2026-08-02", "2026-08-03"],
				new Set(["2026-08-02"]),
			),
		).toEqual(["2026-08-01", "2026-08-03"]);
	});
});

describe("formatAvailabilityReminder", () => {
	it("includes calendar deep link", () => {
		const msg = formatAvailabilityReminder({
			guideName: "Alex",
			dateFrom: "2026-08-01",
			dateTo: "2026-08-07",
			unmarked: ["2026-08-01", "2026-08-03"],
			calendarUrl: "https://app.example.com/dashboard/guides/u1",
		});
		expect(msg.subject).toContain("Confirm your availability");
		expect(msg.bodyText).toContain("Alex");
		expect(msg.bodyText).toContain(
			"https://app.example.com/dashboard/guides/u1",
		);
		expect(msg.smsBody).toContain("/dashboard/guides/u1");
	});
});
