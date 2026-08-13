import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import {
	EMPTY_TOUR_TEMPLATE_FORM,
	TourTemplateForm,
	templateFormToMutationArgs,
} from "./tour-template-form";

export function NewTemplatePage() {
	const navigate = useNavigate();
	const create = useMutation(api.tourTemplates.create);

	return (
		<TourTemplateForm
			defaultValues={EMPTY_TOUR_TEMPLATE_FORM}
			title="New tour template"
			description="Reusable defaults for spinning up tours with the same staffing and copy."
			backTo="/dashboard/templates"
			submitLabel="Create template"
			onSave={async (value) => {
				const args = templateFormToMutationArgs(value);
				const id = await create({
					name: args.name,
					description: args.description,
					tourType: args.tourType,
					durationHours: args.durationHours,
					capacity: args.capacity,
					minGuests: args.minGuests,
					maxGuests: args.maxGuests,
					languages: args.languages,
					inclusions: args.inclusions,
					exclusions: args.exclusions,
					highlights: args.highlights,
					requiredGuides: args.requiredGuides,
					requiresVehicle: args.requiresVehicle,
					requiresDriver: args.requiresDriver,
					requiredVehicleType: args.requiredVehicleType,
				});
				toast.success("Template created");
				void navigate({
					to: "/dashboard/templates/$templateId",
					params: { templateId: id },
				});
			}}
		/>
	);
}
