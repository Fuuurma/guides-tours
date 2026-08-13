import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import {
	EMPTY_VEHICLE_FORM,
	VehicleForm,
	vehicleFormToMutationArgs,
} from "./vehicle-form";

export function NewVehiclePage() {
	const navigate = useNavigate();
	const create = useMutation(api.vehicles.create);

	return (
		<VehicleForm
			mode="create"
			defaultValues={EMPTY_VEHICLE_FORM}
			title="New vehicle"
			description="Add a vehicle your company can assign to departures."
			backTo="/dashboard/vehicles"
			submitLabel="Create vehicle"
			onSave={async (value) => {
				const args = vehicleFormToMutationArgs(value);
				const id = await create({
					name: args.name,
					vehicleType: args.vehicleType,
					capacity: args.capacity,
					licensePlate: args.licensePlate,
					make: args.make,
					model: args.model,
					year: args.year,
					color: args.color,
					ownershipType: args.ownershipType,
					notes: args.notes,
				});
				toast.success("Vehicle created");
				void navigate({
					to: "/dashboard/vehicles/$vehicleId",
					params: { vehicleId: id },
				});
			}}
		/>
	);
}
