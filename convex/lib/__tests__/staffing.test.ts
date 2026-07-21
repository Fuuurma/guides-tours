import { describe, expect, it } from "vitest";
import {
	normalizeTourType,
	preferredVehicleTypeForTour,
	resolveTourStaffing,
	evaluateSlotStaffing,
} from "../staffing";

describe("normalizeTourType", () => {
	it("maps legacy walkable → walking", () => {
		expect(normalizeTourType("walkable")).toBe("walking");
		expect(normalizeTourType("Walkable")).toBe("walking");
	});

	it("defaults empty to walking", () => {
		expect(normalizeTourType("")).toBe("walking");
		expect(normalizeTourType("   ")).toBe("walking");
	});
});

describe("resolveTourStaffing", () => {
	it("infers no fleet for walking", () => {
		expect(resolveTourStaffing({ tourType: "walking" })).toEqual({
			requiresVehicle: false,
			requiresDriver: false,
			requiredVehicleType: undefined,
			requiredGuides: 1,
		});
	});

	it("infers vehicle + driver for car/minivan/bus/boat", () => {
		for (const tourType of ["car", "minivan", "bus", "boat"] as const) {
			const r = resolveTourStaffing({ tourType });
			expect(r.requiresVehicle).toBe(true);
			expect(r.requiresDriver).toBe(true);
			expect(r.requiredVehicleType).toBe(tourType);
		}
	});

	it("honors explicit overrides", () => {
		const r = resolveTourStaffing({
			tourType: "walking",
			requiresVehicle: true,
			requiresDriver: false,
			requiredVehicleType: "minivan",
			requiredGuides: 3,
		});
		expect(r).toEqual({
			requiresVehicle: true,
			requiresDriver: false,
			requiredVehicleType: "minivan",
			requiredGuides: 3,
		});
	});

	it("clamps requiredGuides to at least 1", () => {
		expect(
			resolveTourStaffing({ tourType: "walking", requiredGuides: 0 })
				.requiredGuides,
		).toBe(1);
	});
});

describe("evaluateSlotStaffing", () => {
	it("is ready when guides and fleet match", () => {
		expect(
			evaluateSlotStaffing({
				requiredGuides: 2,
				requiresVehicle: true,
				requiresDriver: true,
				guideCount: 2,
				hasVehicle: true,
				hasDriver: true,
			}),
		).toEqual({ gaps: [], ready: true, guidesNeeded: 0 });
	});

	it("reports missing guides, vehicle, and driver", () => {
		expect(
			evaluateSlotStaffing({
				requiredGuides: 2,
				requiresVehicle: true,
				requiresDriver: true,
				guideCount: 0,
				hasVehicle: false,
				hasDriver: false,
			}),
		).toEqual({
			gaps: ["guides", "vehicle", "driver"],
			ready: false,
			guidesNeeded: 2,
		});
	});
});

describe("preferredVehicleTypeForTour", () => {
	it("returns undefined for walking/other", () => {
		expect(preferredVehicleTypeForTour("walking")).toBeUndefined();
		expect(preferredVehicleTypeForTour("other")).toBeUndefined();
	});

	it("maps transport types", () => {
		expect(preferredVehicleTypeForTour("bus")).toBe("bus");
		expect(preferredVehicleTypeForTour("minivan")).toBe("minivan");
	});
});
