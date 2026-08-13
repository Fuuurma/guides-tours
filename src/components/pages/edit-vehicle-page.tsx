import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { DetailPage } from "@/components/detail-page";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	VehicleForm,
	vehicleDocToFormValues,
	vehicleFormToMutationArgs,
} from "./vehicle-form";

interface EditVehiclePageProps {
	vehicleId: string;
}

export function EditVehiclePage({ vehicleId }: EditVehiclePageProps) {
	const navigate = useNavigate();
	const vehicle = useQuery(api.vehicles.get, {
		vehicleId: vehicleId as Id<"vehicles">,
	});
	const update = useMutation(api.vehicles.update);

	if (vehicle === undefined) {
		return <DetailSkeleton />;
	}
	if (vehicle === null) {
		return (
			<DetailPage title="Vehicle not found" backTo="/dashboard/vehicles" />
		);
	}

	return (
		<VehicleForm
			mode="edit"
			defaultValues={vehicleDocToFormValues(vehicle)}
			title={`Edit ${vehicle.name}`}
			description="Change fleet details. Status controls whether this vehicle can be assigned."
			backTo={`/dashboard/vehicles/${vehicleId}`}
			submitLabel="Save changes"
			idPrefix="edit-v-"
			onSave={async (value) => {
				const args = vehicleFormToMutationArgs(value);
				await update({
					vehicleId: vehicleId as Id<"vehicles">,
					name: args.name,
					vehicleType: args.vehicleType,
					capacity: args.capacity,
					licensePlate: args.licensePlate,
					make: args.make,
					model: args.model,
					year: args.year,
					color: args.color,
					ownershipType: args.ownershipType,
					status: args.status,
					notes: args.notes,
				});
				toast.success("Vehicle updated");
				void navigate({
					to: "/dashboard/vehicles/$vehicleId",
					params: { vehicleId },
				});
			}}
		/>
	);
}
