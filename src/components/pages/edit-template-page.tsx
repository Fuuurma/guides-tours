import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { DetailPage } from "@/components/detail-page";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	TourTemplateForm,
	templateDocToFormValues,
	templateFormToMutationArgs,
} from "./tour-template-form";

interface EditTemplatePageProps {
	templateId: string;
}

export function EditTemplatePage({ templateId }: EditTemplatePageProps) {
	const navigate = useNavigate();
	const template = useQuery(api.tourTemplates.get, {
		templateId: templateId as Id<"tourTemplates">,
	});
	const update = useMutation(api.tourTemplates.update);

	if (template === undefined) {
		return <DetailSkeleton />;
	}
	if (template === null) {
		return (
			<DetailPage title="Template not found" backTo="/dashboard/templates" />
		);
	}

	return (
		<TourTemplateForm
			defaultValues={templateDocToFormValues(template)}
			title={`Edit ${template.name}`}
			description="Update blueprint defaults and staffing. Existing tours are not changed."
			backTo={`/dashboard/templates/${templateId}`}
			submitLabel="Save template"
			idPrefix="edit-"
			onSave={async (value) => {
				const args = templateFormToMutationArgs(value);
				await update({
					templateId: templateId as Id<"tourTemplates">,
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
				toast.success("Template updated");
				void navigate({
					to: "/dashboard/templates/$templateId",
					params: { templateId },
				});
			}}
		/>
	);
}
