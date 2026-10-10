import { centsToInputValue } from "@/lib/format";
import { resolveTourStaffing } from "@/lib/staffing";
import { parseUsdToCents } from "@/lib/validation";
import type { Id } from "../../../convex/_generated/dataModel";

export type TourFormValues = {
	name: string;
	description: string;
	tourType: string;
	categoryId: string;
	durationHours: string;
	capacity: string;
	minGuests: string;
	maxGuests: string;
	priceUsd: string;
	languages: string;
	requiredGuides: string;
	requiresVehicle: boolean;
	requiresDriver: boolean;
	requiredVehicleType: string;
	staffingOverride: boolean;
	isActive: boolean;
};

export const EMPTY_TOUR_FORM: TourFormValues = {
	name: "",
	description: "",
	tourType: "walking",
	categoryId: "",
	durationHours: "2",
	capacity: "10",
	minGuests: "1",
	maxGuests: "10",
	priceUsd: "",
	languages: "en",
	requiredGuides: "1",
	requiresVehicle: false,
	requiresDriver: false,
	requiredVehicleType: "",
	staffingOverride: false,
	isActive: true,
};

export type TourDoc = {
	name: string;
	description?: string;
	tourType: string;
	categoryId?: string;
	durationHours: number;
	capacity: number;
	minGuests: number;
	maxGuests: number;
	isActive: boolean;
	basePriceCents?: number | bigint;
	languages: string[];
	requiredGuides?: number;
	requiresVehicle?: boolean;
	requiresDriver?: boolean;
	requiredVehicleType?: string;
};

export function tourDocToFormValues(tour: TourDoc): TourFormValues {
	const inferred = resolveTourStaffing(tour);
	const hasOverride =
		tour.requiresVehicle !== undefined ||
		tour.requiresDriver !== undefined ||
		Boolean(tour.requiredVehicleType);
	return {
		name: tour.name,
		description: tour.description ?? "",
		tourType: tour.tourType === "walkable" ? "walking" : tour.tourType,
		categoryId: tour.categoryId ?? "",
		durationHours: String(tour.durationHours),
		capacity: String(tour.capacity),
		minGuests: String(tour.minGuests),
		maxGuests: String(tour.maxGuests),
		priceUsd: centsToInputValue(tour.basePriceCents),
		languages: (tour.languages ?? ["en"]).join(", "),
		requiredGuides: String(tour.requiredGuides ?? 1),
		staffingOverride: hasOverride,
		requiresVehicle: tour.requiresVehicle ?? inferred.requiresVehicle,
		requiresDriver: tour.requiresDriver ?? inferred.requiresDriver,
		requiredVehicleType:
			tour.requiredVehicleType ?? inferred.requiredVehicleType ?? "",
		isActive: tour.isActive,
	};
}

export function tourFormToMutationArgs(value: TourFormValues) {
	const inferred = resolveTourStaffing({
		tourType: value.tourType,
		requiredGuides: Number(value.requiredGuides) || 1,
		requiresVehicle: value.staffingOverride ? value.requiresVehicle : undefined,
		requiresDriver: value.staffingOverride ? value.requiresDriver : undefined,
		requiredVehicleType: value.staffingOverride
			? value.requiredVehicleType || undefined
			: undefined,
	});
	const priceCents = value.priceUsd.trim()
		? parseUsdToCents(value.priceUsd)
		: null;
	return {
		name: value.name.trim(),
		description: value.description.trim() || undefined,
		tourType: value.tourType,
		categoryId: value.categoryId
			? (value.categoryId as Id<"tourCategories">)
			: undefined,
		durationHours: Number(value.durationHours),
		capacity: Number(value.capacity),
		minGuests: Number(value.minGuests),
		maxGuests: Number(value.maxGuests),
		basePriceCents: priceCents ?? undefined,
		languages: value.languages
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
		requiredGuides: Number(value.requiredGuides) || 1,
		requiresVehicle: value.staffingOverride ? value.requiresVehicle : undefined,
		requiresDriver: value.staffingOverride ? value.requiresDriver : undefined,
		requiredVehicleType:
			value.staffingOverride && inferred.requiresVehicle
				? value.requiredVehicleType || undefined
				: undefined,
		isActive: value.isActive,
	};
}

