export type VehicleFormValues = {
	name: string;
	vehicleType: string;
	capacity: string;
	licensePlate: string;
	make: string;
	model: string;
	year: string;
	color: string;
	ownershipType: string;
	status: string;
	notes: string;
};

export const EMPTY_VEHICLE_FORM: VehicleFormValues = {
	name: "",
	vehicleType: "minivan",
	capacity: "8",
	licensePlate: "",
	make: "",
	model: "",
	year: "",
	color: "",
	ownershipType: "owned",
	status: "available",
	notes: "",
};

export type VehicleDoc = {
	name: string;
	vehicleType: string;
	capacity: number;
	licensePlate?: string;
	make?: string;
	model?: string;
	year?: number;
	color?: string;
	ownershipType?: string;
	status?: string;
	notes?: string;
};

export function vehicleDocToFormValues(vehicle: VehicleDoc): VehicleFormValues {
	return {
		name: vehicle.name,
		vehicleType: vehicle.vehicleType,
		capacity: String(vehicle.capacity),
		licensePlate: vehicle.licensePlate ?? "",
		make: vehicle.make ?? "",
		model: vehicle.model ?? "",
		year: vehicle.year != null ? String(vehicle.year) : "",
		color: vehicle.color ?? "",
		ownershipType: vehicle.ownershipType || "owned",
		status: vehicle.status || "available",
		notes: vehicle.notes ?? "",
	};
}

export function vehicleFormToMutationArgs(value: VehicleFormValues) {
	const yr = value.year.trim() ? Number(value.year) : undefined;
	return {
		name: value.name.trim(),
		vehicleType: value.vehicleType,
		capacity: Number(value.capacity),
		licensePlate: value.licensePlate.trim() || undefined,
		make: value.make.trim() || undefined,
		model: value.model.trim() || undefined,
		year: yr,
		color: value.color.trim() || undefined,
		ownershipType: value.ownershipType,
		status: value.status,
		notes: value.notes.trim() || undefined,
	};
}

