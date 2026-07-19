import { describe, expect, it } from "vitest";
import {
	addDaysLocal,
	daysInMonthLocal,
	localYmd,
	parseLocalYmd,
	startOfMonthLocal,
	startOfWeekLocal,
} from "../calendar-date";

describe("calendar-date local helpers", () => {
	it("localYmd formats local calendar day", () => {
		const d = new Date(2026, 6, 19, 23, 30); // Jul 19 local
		expect(localYmd(d)).toBe("2026-07-19");
	});

	it("parseLocalYmd round-trips", () => {
		const d = parseLocalYmd("2026-07-19");
		expect(d.getFullYear()).toBe(2026);
		expect(d.getMonth()).toBe(6);
		expect(d.getDate()).toBe(19);
		expect(localYmd(d)).toBe("2026-07-19");
	});

	it("startOfWeekLocal lands on Sunday", () => {
		// 2026-07-19 is a Sunday
		const sun = parseLocalYmd("2026-07-19");
		expect(startOfWeekLocal(sun).getDay()).toBe(0);
		expect(localYmd(startOfWeekLocal(sun))).toBe("2026-07-19");
		// Wednesday → previous Sunday
		const wed = parseLocalYmd("2026-07-22");
		expect(localYmd(startOfWeekLocal(wed))).toBe("2026-07-19");
	});

	it("startOfMonthLocal is day 1", () => {
		const d = parseLocalYmd("2026-07-19");
		expect(localYmd(startOfMonthLocal(d))).toBe("2026-07-01");
	});

	it("addDaysLocal crosses months", () => {
		expect(localYmd(addDaysLocal(parseLocalYmd("2026-07-30"), 2))).toBe(
			"2026-08-01",
		);
	});

	it("daysInMonthLocal handles Feb leap/non-leap", () => {
		expect(daysInMonthLocal(2024, 1)).toBe(29);
		expect(daysInMonthLocal(2026, 1)).toBe(28);
		expect(daysInMonthLocal(2026, 6)).toBe(31);
	});
});
