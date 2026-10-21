/**
 * F840 — an explicit clear must survive the wire. `templateFormToMutationArgs`
 * used to encode "user emptied the description / switched staffing override
 * off" as `undefined`, which update's patch loop reads as "leave unchanged":
 * the stale value persisted while Save reported success. Clears now encode as
 * a real value — "" for description, null for the staffing fields.
 */
import { describe, expect, it } from "vitest";
import {
	EMPTY_TOUR_TEMPLATE_FORM,
	templateFormToMutationArgs,
} from "@/components/pages/tour-template-form-model";

const BASE = { ...EMPTY_TOUR_TEMPLATE_FORM, name: "City Highlights" };

describe("templateFormToMutationArgs clears", () => {
	it('encodes an emptied description as "", not undefined', () => {
		const args = templateFormToMutationArgs({ ...BASE, description: "   " });
		expect(args.description).toBe("");
	});

	it("encodes override-off staffing fields as null, not undefined", () => {
		const args = templateFormToMutationArgs({
			...BASE,
			staffingOverride: false,
			requiresVehicle: true,
			requiresDriver: true,
			requiredVehicleType: "van",
		});
		expect(args.requiresVehicle).toBeNull();
		expect(args.requiresDriver).toBeNull();
		expect(args.requiredVehicleType).toBeNull();
	});

	it("keeps real override values when the switch is on", () => {
		const args = templateFormToMutationArgs({
			...BASE,
			tourType: "bus",
			staffingOverride: true,
			requiresVehicle: true,
			requiresDriver: true,
			requiredVehicleType: "coach",
		});
		expect(args.requiresVehicle).toBe(true);
		expect(args.requiresDriver).toBe(true);
		expect(args.requiredVehicleType).toBe("coach");
	});
});
