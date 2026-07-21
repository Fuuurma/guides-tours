/**
 * Tour ↔ fleet staffing helpers (Convex).
 *
 * Tours declare how they should be staffed; assignments enforce it.
 * Optional tour flags override defaults inferred from tourType.
 */

export const TOUR_TYPES = [
	"walking",
	"car",
	"minivan",
	"bus",
	"boat",
	"other",
] as const;

export const VEHICLE_TYPES = [
	"car",
	"minivan",
	"van",
	"bus",
	"boat",
	"other",
] as const;

export type TourType = (typeof TOUR_TYPES)[number];
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Normalize legacy "walkable" → "walking". */
export function normalizeTourType(raw: string): string {
	const t = raw.trim().toLowerCase();
	if (t === "walkable") return "walking";
	return t || "walking";
}

const TRANSPORT_TYPES = new Set(["car", "minivan", "van", "bus", "boat"]);

export type TourStaffingRules = {
	requiresVehicle: boolean;
	requiresDriver: boolean;
	requiredVehicleType: string | undefined;
	requiredGuides: number;
};

/**
 * Resolve effective staffing rules for a tour document.
 * Explicit flags win; otherwise infer from tourType.
 */
export function resolveTourStaffing(tour: {
	tourType: string;
	requiredGuides?: number;
	requiresVehicle?: boolean;
	requiresDriver?: boolean;
	requiredVehicleType?: string;
}): TourStaffingRules {
	const tourType = normalizeTourType(tour.tourType);
	const transport = TRANSPORT_TYPES.has(tourType);
	const requiresVehicle = tour.requiresVehicle ?? transport;
	const requiresDriver = tour.requiresDriver ?? transport;
	const requiredVehicleType =
		tour.requiredVehicleType?.trim() ||
		(requiresVehicle && tourType !== "other" && tourType !== "walking"
			? tourType === "van"
				? "van"
				: tourType
			: undefined);
	const requiredGuides = Math.max(1, Math.floor(tour.requiredGuides ?? 1));
	return {
		requiresVehicle,
		requiresDriver,
		requiredVehicleType,
		requiredGuides,
	};
}

/** Map tour type → preferred vehicle type for pickers. */
export function preferredVehicleTypeForTour(tourType: string): string | undefined {
	const t = normalizeTourType(tourType);
	if (t === "walking" || t === "other") return undefined;
	if (t === "minivan") return "minivan";
	if (t === "van") return "van";
	if (t === "bus") return "bus";
	if (t === "boat") return "boat";
	if (t === "car") return "car";
	return undefined;
}

export type SlotGap = "guides" | "vehicle" | "driver";

export type SlotStaffingInput = {
	requiredGuides: number;
	requiresVehicle: boolean;
	requiresDriver: boolean;
	guideCount: number;
	hasVehicle: boolean;
	hasDriver: boolean;
};

/** What a departure still needs before it's fully staffed. */
export function evaluateSlotStaffing(slot: SlotStaffingInput): {
	gaps: SlotGap[];
	ready: boolean;
	guidesNeeded: number;
} {
	const gaps: SlotGap[] = [];
	const guidesNeeded = Math.max(0, slot.requiredGuides - slot.guideCount);
	if (guidesNeeded > 0) gaps.push("guides");
	if (slot.requiresVehicle && !slot.hasVehicle) gaps.push("vehicle");
	if (slot.requiresDriver && !slot.hasDriver) gaps.push("driver");
	return { gaps, ready: gaps.length === 0, guidesNeeded };
}
