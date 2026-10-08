// @vitest-environment jsdom

// work:768 — TourTypeField owns the tourType ToggleGroup block cloned
// byte-for-byte between tour-form.tsx and tour-template-form.tsx
// (react-doctor duplicate-jsx-subtree). Takes the bound field's value +
// handleChange only, so the pins below need no form instance.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TourTypeField } from "../components/pages/tour-type-field";
import { TOUR_TYPES } from "../lib/staffing";

function Harness({
	value = "walking",
	onChange = vi.fn(),
}: {
	value?: string;
	onChange?: (value: string) => void;
}) {
	return (
		<TourTypeField
			field={{ state: { value }, handleChange: onChange }}
			id={(s) => `test-${s}`}
		/>
	);
}

describe("TourTypeField", () => {
	it("renders the Type label, every tour type, and the vehicle hint", () => {
		render(<Harness />);

		expect(document.body.textContent).toContain("Type");
		for (const t of TOUR_TYPES) {
			expect(screen.getByRole("radio", { name: t })).toBeTruthy();
		}
		expect(document.body.textContent).toContain(
			"Transport types default to needing a vehicle and driver.",
		);
	});

	it("marks the current value pressed and forwards a change", () => {
		const onChange = vi.fn();
		render(<Harness value="walking" onChange={onChange} />);

		const walking = screen.getByRole("radio", { name: "walking" });
		const boat = screen.getByRole("radio", { name: "boat" });
		expect(walking.getAttribute("aria-checked")).toBe("true");
		expect(boat.getAttribute("aria-checked")).toBe("false");

		fireEvent.click(boat);

		expect(onChange).toHaveBeenCalledWith("boat");
	});

	it("swallows the empty deselect instead of clearing the value", () => {
		const onChange = vi.fn();
		render(<Harness value="boat" onChange={onChange} />);

		// Single-select emits "" when the pressed option is clicked again.
		fireEvent.click(screen.getByRole("radio", { name: "boat" }));

		expect(onChange).not.toHaveBeenCalled();
	});
});
