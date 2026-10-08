/**
 * tour-template validation — extracted submit rules for TourTemplateForm.
 *
 * Regression guard (work:770/t-c69515c28c): the onSubmit checks moved here
 * verbatim so the giant form component could be split; these pins lock the
 * exact messages, including the min/max pair failing both fields at once.
 */
import { describe, expect, it } from "vitest";
import { EMPTY_TOUR_TEMPLATE_FORM } from "@/components/pages/tour-template-form";
import {
	type TourTemplateFormValues,
	validateTourTemplateDraft,
} from "@/components/pages/tour-template-validation";

const VALID: TourTemplateFormValues = {
	...EMPTY_TOUR_TEMPLATE_FORM,
	name: "City Highlights",
};

describe("validateTourTemplateDraft", () => {
	it("accepts a valid draft", () => {
		expect(validateTourTemplateDraft(VALID)).toEqual([]);
	});

	it("rejects a short name", () => {
		expect(validateTourTemplateDraft({ ...VALID, name: "x" })).toEqual([
			{ field: "name", message: "Name must be at least 2 characters" },
		]);
	});

	it("rejects non-positive numbers", () => {
		const problems = validateTourTemplateDraft({
			...VALID,
			durationHours: "0",
			capacity: "abc",
		});
		expect(problems).toContainEqual({
			field: "durationHours",
			message: "Duration must be a positive number",
		});
		expect(problems).toContainEqual({
			field: "capacity",
			message: "Capacity must be a positive number",
		});
	});

	it("fails both min and max guests when min exceeds max", () => {
		expect(
			validateTourTemplateDraft({ ...VALID, minGuests: "8", maxGuests: "4" }),
		).toEqual([
			{ field: "minGuests", message: "Min guests cannot exceed max guests" },
			{ field: "maxGuests", message: "Min guests cannot exceed max guests" },
		]);
	});

	it("skips the min/max comparison when either side is invalid", () => {
		const problems = validateTourTemplateDraft({
			...VALID,
			minGuests: "abc",
			maxGuests: "4",
		});
		expect(
			problems.some((p) => p.message === "Min guests cannot exceed max guests"),
		).toBe(false);
		expect(problems).toContainEqual({
			field: "minGuests",
			message: "Min guests must be a positive number",
		});
	});

	it("rejects an invalid guides count", () => {
		expect(
			validateTourTemplateDraft({ ...VALID, requiredGuides: "0" }),
		).toContainEqual({
			field: "requiredGuides",
			message: "Required guides must be a positive number",
		});
	});

	it("rejects an over-long description", () => {
		const problems = validateTourTemplateDraft({
			...VALID,
			description: "x".repeat(5001),
		});
		expect(problems).toHaveLength(1);
		expect(problems[0].field).toBe("description");
		expect(problems[0].message).toMatch(/too long/);
	});
});
