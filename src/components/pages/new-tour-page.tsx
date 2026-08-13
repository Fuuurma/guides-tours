import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { EMPTY_TOUR_FORM, TourForm, tourFormToMutationArgs } from "./tour-form";

export function NewTourPage() {
	const navigate = useNavigate();
	const create = useMutation(api.tours.create);

	return (
		<TourForm
			mode="create"
			defaultValues={EMPTY_TOUR_FORM}
			title="New tour"
			description="What your company runs. After you save, publish a departure and assign who runs it."
			backTo="/dashboard/tours"
			submitLabel="Create tour"
			onSave={async (value) => {
				const args = tourFormToMutationArgs(value);
				const id = await create({
					name: args.name,
					description: args.description,
					tourType: args.tourType,
					categoryId: args.categoryId,
					durationHours: args.durationHours,
					capacity: args.capacity,
					minGuests: args.minGuests,
					maxGuests: args.maxGuests,
					basePriceCents: args.basePriceCents,
					languages: args.languages,
					requiredGuides: args.requiredGuides,
					requiresVehicle: args.requiresVehicle,
					requiresDriver: args.requiresDriver,
					requiredVehicleType: args.requiredVehicleType,
				});
				toast.success("Tour created");
				void navigate({
					to: "/dashboard/tours/$tourId",
					params: { tourId: id },
				});
			}}
		/>
	);
}
