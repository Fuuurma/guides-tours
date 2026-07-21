import { describe, expect, it } from "vitest";
import { aggregateDailyTourMetrics } from "@/components/tour-revenue-bars";

describe("aggregateDailyTourMetrics", () => {
	it("sums multiple tours on the same day", () => {
		const days = aggregateDailyTourMetrics([
			{
				periodDate: "2026-07-01",
				periodType: "daily",
				totalBookings: 2,
				totalGuests: 5,
				grossRevenueCents: 10000n,
			},
			{
				periodDate: "2026-07-01",
				periodType: "daily",
				totalBookings: 1,
				totalGuests: 2,
				grossRevenueCents: 5000,
			},
			{
				periodDate: "2026-07-02",
				periodType: "daily",
				totalBookings: 3,
				totalGuests: 8,
				grossRevenueCents: 20000n,
			},
		]);
		expect(days).toHaveLength(2);
		expect(days[0]).toMatchObject({
			periodDate: "2026-07-01",
			totalBookings: 3,
			totalGuests: 7,
			grossRevenueCents: 15000,
		});
		expect(days[1]?.totalBookings).toBe(3);
	});

	it("skips non-daily period types", () => {
		const days = aggregateDailyTourMetrics([
			{
				periodDate: "2026-07",
				periodType: "monthly",
				totalBookings: 10,
				totalGuests: 20,
				grossRevenueCents: 99999,
			},
		]);
		expect(days).toHaveLength(0);
	});
});
