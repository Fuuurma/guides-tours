import type { TourTemplateFormValues } from "./tour-template-form-model";
import {
	validateDescriptionOptional,
	validateName,
	validatePositiveInteger,
	validatePositiveNumber,
} from "@/lib/validation";

export type TemplateDraftProblem = {
	field: keyof TourTemplateFormValues;
	message: string;
};

/**
 * Submit-time checks for the tour-template form, extracted verbatim from
 * TourTemplateForm.onSubmit. An array (not a map) preserves the min/max
 * pair failing both fields with the same message.
 */
export function validateTourTemplateDraft(
	value: TourTemplateFormValues,
): TemplateDraftProblem[] {
	const problems: TemplateDraftProblem[] = [];

	const nameErr = validateName(value.name);
	if (nameErr) problems.push({ field: "name", message: nameErr });
	const descErr = validateDescriptionOptional(value.description);
	if (descErr) problems.push({ field: "description", message: descErr });
	const durErr = validatePositiveNumber(value.durationHours, "Duration");
	if (durErr) problems.push({ field: "durationHours", message: durErr });
	const capErr = validatePositiveInteger(value.capacity, "Capacity");
	if (capErr) problems.push({ field: "capacity", message: capErr });
	const minErr = validatePositiveInteger(value.minGuests, "Min guests");
	if (minErr) problems.push({ field: "minGuests", message: minErr });
	const maxErr = validatePositiveInteger(value.maxGuests, "Max guests");
	if (maxErr) problems.push({ field: "maxGuests", message: maxErr });
	if (!minErr && !maxErr && Number(value.minGuests) > Number(value.maxGuests)) {
		problems.push({
			field: "minGuests",
			message: "Min guests cannot exceed max guests",
		});
		problems.push({
			field: "maxGuests",
			message: "Min guests cannot exceed max guests",
		});
	}
	const guidesErr = validatePositiveInteger(
		value.requiredGuides,
		"Required guides",
	);
	if (guidesErr) problems.push({ field: "requiredGuides", message: guidesErr });

	return problems;
}
