// Tests for TourOption — the public booking page's selectable tour row.
//
// Pins three reviewed behaviors:
//   - The operator's primary cover renders with its alt text; without a
//     cover the same slot holds a serif monogram (layout never shifts).
//   - The per-person rate is its own tabular figure, not buried in the
//     duration/capacity meta line.
//   - The radio stays a real labelled input wired to the form field.
//
// House style: plain chai assertions (no jest-dom matchers in this repo).

// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TourOption, type TourOptionTour } from "../components/tour-option";

const baseTour: TourOptionTour = {
	_id: "tour1",
	name: "Costa Brava Kayak",
	description: "Paddle the coves at golden hour.",
	durationHours: 3,
	maxGuests: 8,
	currency: "EUR",
	basePriceCents: 4500,
	primaryImageUrl: null,
	primaryImageAlt: null,
};

function setup(tour: TourOptionTour = baseTour, checked = false) {
	const onSelect = vi.fn();
	const onBlur = vi.fn();
	render(
		<TourOption
			tour={tour}
			fieldName="tourId"
			checked={checked}
			onSelect={onSelect}
			onBlur={onBlur}
		/>,
	);
	return { onSelect, onBlur };
}

describe("TourOption", () => {
	it("renders the cover photo with alt text when present", () => {
		setup({
			...baseTour,
			primaryImageUrl: "https://cdn.example.com/kayak.jpg",
			primaryImageAlt: "Kayaks lined up on a cove beach",
		});
		const img = screen.getByRole("img", {
			name: "Kayaks lined up on a cove beach",
		});
		expect(img.getAttribute("src")).toBe("https://cdn.example.com/kayak.jpg");
	});

	it("falls back to a monogram tile without a cover", () => {
		setup();
		expect(screen.queryByRole("img")).toBeNull();
		expect(screen.getByText("C").tagName).toBe("SPAN");
	});

	it("lifts the rate into its own tabular figure", () => {
		setup();
		expect(screen.getByText("€45.00", { exact: false })).toBeTruthy();
		expect(screen.getByText("per person")).toBeTruthy();
		const meta = screen.getByText(/3h · up to 8 guests/);
		expect(meta.className).toContain("tabular-nums");
		const rate = screen.getByText("per person").parentElement;
		expect(rate?.className).toContain("tabular-nums");
	});

	it("wires the radio to the form field", () => {
		const { onSelect } = setup(baseTour, false);
		const radio = screen.getByRole("radio", {
			name: /costa brava kayak/i,
		}) as HTMLInputElement;
		expect(radio.checked).toBe(false);
		fireEvent.click(radio);
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it("marks the selected option", () => {
		setup(baseTour, true);
		expect((screen.getByRole("radio") as HTMLInputElement).checked).toBe(true);
	});
});
