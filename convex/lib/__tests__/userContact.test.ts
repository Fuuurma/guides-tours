import { describe, expect, it } from "vitest";
import { buildMissingStaffPhones } from "../userContact";

describe("buildMissingStaffPhones", () => {
	it("returns guides and drivers with empty phone", () => {
		const missing = buildMissingStaffPhones({
			guideCounts: new Map([
				["g1", 2],
				["g2", 1],
			]),
			drivers: new Map([
				["d1", { userId: "drv1", count: 3 }],
			]),
			contacts: new Map([
				["g1", { name: "Alex", email: "a@x.com", phone: "" }],
				["g2", { name: "Bea", email: "b@x.com", phone: "+1555" }],
				["drv1", { name: "Sam", email: "s@x.com", phone: "  " }],
			]),
		});
		expect(missing.map((m) => m.userId)).toEqual(["drv1", "g1"]);
		expect(missing[0]?.roles).toEqual(["driver"]);
		expect(missing[0]?.assignmentCount).toBe(3);
		expect(missing[1]?.roles).toEqual(["guide"]);
	});

	it("merges guide+driver roles for the same user", () => {
		const missing = buildMissingStaffPhones({
			guideCounts: new Map([["u1", 1]]),
			drivers: new Map([["d9", { userId: "u1", count: 2 }]]),
			contacts: new Map([
				["u1", { name: "Pat", email: "p@x.com", phone: "" }],
			]),
		});
		expect(missing).toHaveLength(1);
		expect(missing[0]?.roles).toEqual(["driver", "guide"]);
		expect(missing[0]?.assignmentCount).toBe(3);
		expect(missing[0]?.driverId).toBe("d9");
	});

	it("skips users with a phone", () => {
		expect(
			buildMissingStaffPhones({
				guideCounts: new Map([["g1", 1]]),
				drivers: new Map(),
				contacts: new Map([
					["g1", { name: "Alex", email: "a@x.com", phone: "+1" }],
				]),
			}),
		).toEqual([]);
	});
});
