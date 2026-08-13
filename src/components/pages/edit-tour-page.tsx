import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { DetailPage } from "@/components/detail-page";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	TourForm,
	tourDocToFormValues,
	tourFormToMutationArgs,
} from "./tour-form";

interface EditTourPageProps {
	tourId: string;
}

export function EditTourPage({ tourId }: EditTourPageProps) {
	const navigate = useNavigate();
	const tour = useQuery(api.tours.get, { tourId: tourId as Id<"tours"> });
	const update = useMutation(api.tours.update);

	if (tour === undefined) {
		return <DetailSkeleton />;
	}
	if (tour === null) {
		return <DetailPage title="Tour not found" backTo="/dashboard/tours" />;
	}

	return (
		<TourForm
			mode="edit"
			defaultValues={tourDocToFormValues(tour)}
			title={`Edit ${tour.name}`}
			description="Change how this tour is staffed and shown. Saving does not publish new dates."
			backTo={`/dashboard/tours/${tourId}`}
			submitLabel="Save changes"
			idPrefix="edit-"
			onSave={async (value) => {
				const args = tourFormToMutationArgs(value);
				await update({
					tourId: tourId as Id<"tours">,
					name: args.name,
					description: args.description,
					tourType: args.tourType,
					categoryId: args.categoryId,
					durationHours: args.durationHours,
					capacity: args.capacity,
					minGuests: args.minGuests,
					maxGuests: args.maxGuests,
					isActive: args.isActive,
					basePriceCents: args.basePriceCents,
					languages: args.languages,
					requiredGuides: args.requiredGuides,
					requiresVehicle: args.requiresVehicle,
					requiresDriver: args.requiresDriver,
					requiredVehicleType: args.requiredVehicleType,
				});
				toast.success("Tour updated");
				void navigate({
					to: "/dashboard/tours/$tourId",
					params: { tourId },
				});
			}}
		/>
	);
}
