// Tests for BookingHero + deriveBookingHeroStats.
//
// Pins:
//   - stats derive from real tour data only (min price, max group,
//     count) with no invented proof
//   - unpriced tours yield "Prices vary", not a fabricated number
//   - the photo band is aria-hidden decor (placeholder photography,
//     not the operator's own)
//   - the metric strip hides when there are no tours (nothing honest
//     to show)

// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("motion/react", () => ({
	animate: vi.fn(),
	useInView: () => true,
	useReducedMotion: () => true,
}));

import {
	BookingHero,
	deriveBookingHeroStats,
} from "../components/booking-hero";
import { TrustMetric } from "../components/trust-metric";

const TOURS = [
	{
		_id: "t1",
		name: "Harbor walk",
		maxGuests: 12,
		currency: "EUR",
		basePriceCents: 4500,
	},
	{
		_id: "t2",
		name: "Old town food",
		maxGuests: 8,
		currency: "EUR",
		basePriceCents: 6000,
	},
];

describe("deriveBookingHeroStats", () => {
	it("derives count, min price, and max group from real tours", () => {
		expect(deriveBookingHeroStats(TOURS)).toEqual({
			tourCount: 2,
			fromPrice: "€45",
			maxGroup: 12,
		});
	});

	it("returns nulls for an empty tour list", () => {
		expect(deriveBookingHeroStats([])).toEqual({
			tourCount: 0,
			fromPrice: null,
			maxGroup: null,
		});
	});

	it("ignores unpriced tours when computing the from price", () => {
		expect(
			deriveBookingHeroStats([
				{
					_id: "t1",
					name: "Unpriced",
					maxGuests: 4,
					currency: "EUR",
					basePriceCents: undefined,
				},
			]),
		).toEqual({ tourCount: 1, fromPrice: null, maxGroup: 4 });
	});

	it("accepts bigint cents from Convex", () => {
		expect(
			deriveBookingHeroStats([
				{
					_id: "t1",
					name: "Big",
					maxGuests: 6,
					currency: "USD",
					basePriceCents: 2500n,
				},
			]),
		).toEqual({ tourCount: 1, fromPrice: "$25", maxGroup: 6 });
	});
});

describe("BookingHero", () => {
	it("renders the org masthead and the metric strip", () => {
		render(
			<BookingHero
				organizationName="Costa Brava Tours"
				slug="cbt"
				tours={TOURS}
			/>,
		);
		expect(screen.getByRole("heading", { name: /Costa Brava Tours/ })); // throws when missing
		expect(screen.getByText("tours offered")); // throws when missing
		expect(screen.getByText("€45")); // throws when missing
		expect(screen.getByText("largest group welcome")); // throws when missing
	});

	it("hides the photo band from assistive tech (placeholder art)", () => {
		const { container } = render(
			<BookingHero
				organizationName="Costa Brava Tours"
				slug="cbt"
				tours={TOURS}
			/>,
		);
		const band = container.querySelector('[aria-hidden="true"] img');
		expect(band).not.toBeNull();
		expect(band?.getAttribute("src")).toContain("picsum.photos/seed/");
		expect(band?.getAttribute("src")).toContain("cbt");
	});

	it("shows Prices vary when no tour is priced", () => {
		render(
			<BookingHero
				organizationName="Costa Brava Tours"
				slug="cbt"
				tours={[
					{
						_id: "t1",
						name: "Unpriced",
						maxGuests: 4,
						currency: "EUR",
						basePriceCents: undefined,
					},
				]}
			/>,
		);
		expect(screen.getByText("Prices vary")); // throws when missing
	});

	it("hides the metric strip when there are no tours", () => {
		render(
			<BookingHero
				organizationName="Costa Brava Tours"
				slug="cbt"
				tours={[]}
			/>,
		);
		expect(screen.getByRole("heading", { name: /Costa Brava Tours/ })); // throws when missing
		expect(screen.queryByText("tours offered")).toBeNull();
	});
});

describe("TrustMetric (shared)", () => {
	it("renders the valueText path with no animation", () => {
		render(<TrustMetric valueText="One board" label="the whole week" />);
		expect(screen.getByText("One board")); // throws when missing
		expect(screen.getByText("the whole week")); // throws when missing
	});

	it("renders the final count immediately under reduced motion", () => {
		render(<TrustMetric value={7} label="OTA channels" />);
		expect(screen.getByText("7")); // throws when missing
	});
});
