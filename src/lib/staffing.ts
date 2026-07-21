/**
 * Tour ↔ fleet staffing constants (frontend).
 * Mirrors convex/lib/staffing.ts — keep in sync.
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

export function normalizeTourType(raw: string): string {
	const t = raw.trim().toLowerCase();
	if (t === "walkable") return "walking";
	return t || "walking";
}

const TRANSPORT_TYPES = new Set(["car", "minivan", "van", "bus", "boat"]);

export function resolveTourStaffing(tour: {
	tourType: string;
	requiredGuides?: number;
	requiresVehicle?: boolean;
	requiresDriver?: boolean;
	requiredVehicleType?: string;
}): {
	requiresVehicle: boolean;
	requiresDriver: boolean;
	requiredVehicleType: string | undefined;
	requiredGuides: number;
} {
	const tourType = normalizeTourType(tour.tourType);
	const transport = TRANSPORT_TYPES.has(tourType);
	const requiresVehicle = tour.requiresVehicle ?? transport;
	const requiresDriver = tour.requiresDriver ?? transport;
	const requiredVehicleType =
		tour.requiredVehicleType?.trim() ||
		(requiresVehicle && tourType !== "other" && tourType !== "walking"
			? tourType
			: undefined);
	return {
		requiresVehicle,
		requiresDriver,
		requiredVehicleType,
		requiredGuides: Math.max(1, Math.floor(tour.requiredGuides ?? 1)),
	};
}

export type SlotGap = "guides" | "vehicle" | "driver";

/** What a departure still needs before it's fully staffed. */
export function evaluateSlotStaffing(slot: {
	requiredGuides: number;
	requiresVehicle: boolean;
	requiresDriver: boolean;
	guideCount: number;
	hasVehicle: boolean;
	hasDriver: boolean;
}): {
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
