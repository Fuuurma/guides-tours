import { resolveTourStaffing } from "@/lib/staffing";
export type TourTemplateFormValues = {
	name: string;
	description: string;
	tourType: string;
	durationHours: string;
	capacity: string;
	minGuests: string;
	maxGuests: string;
	languages: string;
	inclusions: string;
	exclusions: string;
	highlights: string;
	requiredGuides: string;
	requiresVehicle: boolean;
	requiresDriver: boolean;
	requiredVehicleType: string;
	staffingOverride: boolean;
};

export const EMPTY_TOUR_TEMPLATE_FORM: TourTemplateFormValues = {
	name: "",
	description: "",
	tourType: "walking",
	durationHours: "2",
	capacity: "10",
	minGuests: "1",
	maxGuests: "10",
	languages: "en",
	inclusions: "",
	exclusions: "",
	highlights: "",
	requiredGuides: "1",
	requiresVehicle: false,
	requiresDriver: false,
	requiredVehicleType: "",
	staffingOverride: false,
};

export type TemplateDoc = {
	name: string;
	description?: string;
	tourType: string;
	durationHours: number;
	capacity: number;
	minGuests?: number;
	maxGuests?: number;
	languages?: string[];
	inclusions?: string[];
	exclusions?: string[];
	highlights?: string[];
	requiredGuides?: number;
	requiresVehicle?: boolean;
	requiresDriver?: boolean;
	requiredVehicleType?: string;
};

export function templateDocToFormValues(
	template: TemplateDoc,
): TourTemplateFormValues {
	const tourType =
		template.tourType === "walkable" ? "walking" : template.tourType;
	const inferred = resolveTourStaffing({ tourType });
	const hasOverride =
		template.requiresVehicle !== undefined ||
		template.requiresDriver !== undefined ||
		Boolean(template.requiredVehicleType);
	return {
		name: template.name,
		description: template.description ?? "",
		tourType,
		durationHours: String(template.durationHours),
		capacity: String(template.capacity),
		minGuests: String(template.minGuests ?? 1),
		maxGuests: String(template.maxGuests ?? template.capacity),
		languages: (template.languages ?? []).join(", "),
		inclusions: (template.inclusions ?? []).join("\n"),
		exclusions: (template.exclusions ?? []).join("\n"),
		highlights: (template.highlights ?? []).join("\n"),
		requiredGuides: String(template.requiredGuides ?? 1),
		staffingOverride: hasOverride,
		requiresVehicle: template.requiresVehicle ?? inferred.requiresVehicle,
		requiresDriver: template.requiresDriver ?? inferred.requiresDriver,
		requiredVehicleType:
			template.requiredVehicleType ?? inferred.requiredVehicleType ?? "",
	};
}

export function templateFormToMutationArgs(value: TourTemplateFormValues) {
	const inferred = resolveTourStaffing({
		tourType: value.tourType,
		requiredGuides: Number(value.requiredGuides) || 1,
		requiresVehicle: value.staffingOverride ? value.requiresVehicle : undefined,
		requiresDriver: value.staffingOverride ? value.requiresDriver : undefined,
		requiredVehicleType: value.staffingOverride
			? value.requiredVehicleType || undefined
			: undefined,
	});
	return {
		name: value.name.trim(),
		// F840: an explicit clear must reach the server. "" is a real value
		// (internalCreate already stores "" for an absent description), while
		// undefined would read as "leave unchanged" and resurrect the stale text.
		description: value.description.trim(),
		tourType: value.tourType,
		durationHours: Number(value.durationHours),
		capacity: Number(value.capacity),
		minGuests: Number(value.minGuests),
		maxGuests: Number(value.maxGuests),
		languages: value.languages
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
			.slice(0, 20),
		inclusions: splitLines(value.inclusions),
		exclusions: splitLines(value.exclusions),
		highlights: splitLines(value.highlights),
		requiredGuides: Number(value.requiredGuides) || 1,
		// F840: null is the deletion sentinel — undefined would leave a stale
		// override on the doc while the switch says it is off.
		requiresVehicle: value.staffingOverride ? value.requiresVehicle : null,
		requiresDriver: value.staffingOverride ? value.requiresDriver : null,
		requiredVehicleType:
			value.staffingOverride && inferred.requiresVehicle
				? value.requiredVehicleType || null
				: null,
	};
}

function splitLines(s: string) {
	return s
		.split("\n")
		.map((x) => x.trim())
		.filter(Boolean)
		.slice(0, 100);
}
