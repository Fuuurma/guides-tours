import { useQuery as useConvexQuery, useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { DetailPage } from "@/components/detail-page";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { StaffingFormSection } from "@/components/staffing-form-section";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TOUR_TYPES } from "@/lib/staffing";
import {
	MAX_DESCRIPTION_LEN,
	MAX_NAME_LEN,
	validateDescriptionOptional,
	validatePositiveInteger,
	validatePositiveNumber,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FormField } from "../form";

interface FormValues extends Record<string, unknown> {
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
}

interface EditTemplatePageProps {
	templateId: string;
}

export function EditTemplatePage({ templateId }: EditTemplatePageProps) {
	const template = useConvexQuery(api.tourTemplates.get, {
		templateId: templateId as Id<"tourTemplates">,
	});
	const update = useMutation(api.tourTemplates.update);
	const [loaded, setLoaded] = useState(false);

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const minG = Number(v.minGuests);
			const maxG = Number(v.maxGuests);
			if (minG > maxG) {
				throw new Error("minGuests cannot exceed maxGuests");
			}
			const split = (s: string) =>
				s
					.split("\n")
					.map((x) => x.trim())
					.filter(Boolean)
					.slice(0, 100);
			await update({
				templateId: templateId as Id<"tourTemplates">,
				name: v.name.trim(),
				description: v.description.trim() || undefined,
				tourType: v.tourType,
				durationHours: Number(v.durationHours),
				capacity: Number(v.capacity),
				minGuests: minG,
				maxGuests: maxG,
				languages: v.languages
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
					.slice(0, 20),
				inclusions: split(v.inclusions),
				exclusions: split(v.exclusions),
				highlights: split(v.highlights),
				requiredGuides: Number(v.requiredGuides) || 1,
				requiresVehicle: v.staffingOverride ? v.requiresVehicle : undefined,
				requiresDriver: v.staffingOverride ? v.requiresDriver : undefined,
				requiredVehicleType:
					v.staffingOverride && v.requiresVehicle
						? v.requiredVehicleType || undefined
						: undefined,
			});
			return templateId;
		},
		validate: (v) => {
			const errs: Record<string, string> = {};
			const durErr = validatePositiveNumber(v.durationHours, "Duration");
			if (durErr) errs.durationHours = durErr;
			const capErr = validatePositiveInteger(v.capacity, "Capacity");
			if (capErr) errs.capacity = capErr;
			const minErr = validatePositiveInteger(v.minGuests, "Min guests");
			if (minErr) errs.minGuests = minErr;
			const maxErr = validatePositiveInteger(v.maxGuests, "Max guests");
			if (maxErr) errs.maxGuests = maxErr;
			if (!minErr && !maxErr && Number(v.minGuests) > Number(v.maxGuests)) {
				errs.minGuests = "minGuests cannot exceed maxGuests";
				errs.maxGuests = "minGuests cannot exceed maxGuests";
			}
			const descErr = validateDescriptionOptional(v.description);
			if (descErr) errs.description = descErr;
			return Object.keys(errs).length > 0 ? errs : null;
		},
		initialValues: {
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
		},
		redirectTo: (id) => `/dashboard/templates/${id}`,
		successMessage: "Template updated",
	});

	useEffect(() => {
		if (template && !loaded) {
			const t = template;
			form.set("name", t.name);
			form.set("description", t.description ?? "");
			form.set("tourType", t.tourType === "walkable" ? "walking" : t.tourType);
			form.set("durationHours", String(t.durationHours));
			form.set("capacity", String(t.capacity));
			form.set("minGuests", String(t.minGuests));
			form.set("maxGuests", String(t.maxGuests));
			form.set("languages", (t.languages ?? []).join(", "));
			form.set("inclusions", (t.inclusions ?? []).join("\n"));
			form.set("exclusions", (t.exclusions ?? []).join("\n"));
			form.set("highlights", (t.highlights ?? []).join("\n"));
			form.set("requiredGuides", String(t.requiredGuides ?? 1));
			const override =
				t.requiresVehicle !== undefined ||
				t.requiresDriver !== undefined ||
				Boolean(t.requiredVehicleType);
			form.set("staffingOverride", override);
			form.set("requiresVehicle", t.requiresVehicle ?? false);
			form.set("requiresDriver", t.requiresDriver ?? false);
			form.set("requiredVehicleType", t.requiredVehicleType ?? "");
			setLoaded(true);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot load
	}, [template, loaded, form.set]);

	if (template === undefined) {
		return <DetailSkeleton />;
	}
	if (template === null) {
		return (
			<DetailPage title="Template not found" backTo="/dashboard/templates" />
		);
	}

	return (
		<EntityFormPage
			form={form}
			title="Edit template"
			description="Update blueprint defaults and staffing"
			backTo={`/dashboard/templates/${templateId}`}
			submitLabel="Save template"
		>
			<FormField label="Name *" htmlFor="edit-name">
				<Input
					id="edit-name"
					required
					maxLength={MAX_NAME_LEN}
					value={form.values.name}
					onChange={(e) => form.set("name", e.target.value)}
				/>
			</FormField>

			<FormField
				label="Description"
				htmlFor="edit-desc"
				error={form.fieldErrors.description}
			>
				<Textarea
					id="edit-desc"
					value={form.values.description}
					onChange={(e) => form.set("description", e.target.value)}
					rows={3}
					maxLength={MAX_DESCRIPTION_LEN}
				/>
			</FormField>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Type" htmlFor="edit-type">
					<Select
						value={form.values.tourType}
						onValueChange={(v) => form.set("tourType", v)}
					>
						<SelectTrigger id="edit-type">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TOUR_TYPES.map((t) => (
								<SelectItem key={t} value={t}>
									{t}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FormField>
				<FormField
					label="Duration (hours) *"
					htmlFor="edit-dur"
					error={form.fieldErrors.durationHours}
				>
					<Input
						id="edit-dur"
						type="number"
						step="0.5"
						min="0.5"
						required
						value={form.values.durationHours}
						onChange={(e) => form.set("durationHours", e.target.value)}
					/>
				</FormField>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<FormField
					label="Capacity *"
					htmlFor="edit-cap"
					error={form.fieldErrors.capacity}
				>
					<Input
						id="edit-cap"
						type="number"
						min="1"
						required
						value={form.values.capacity}
						onChange={(e) => form.set("capacity", e.target.value)}
					/>
				</FormField>
				<FormField
					label="Min guests"
					htmlFor="edit-min"
					error={form.fieldErrors.minGuests}
				>
					<Input
						id="edit-min"
						type="number"
						min="1"
						value={form.values.minGuests}
						onChange={(e) => form.set("minGuests", e.target.value)}
					/>
				</FormField>
				<FormField
					label="Max guests"
					htmlFor="edit-max"
					error={form.fieldErrors.maxGuests}
				>
					<Input
						id="edit-max"
						type="number"
						min="1"
						value={form.values.maxGuests}
						onChange={(e) => form.set("maxGuests", e.target.value)}
					/>
				</FormField>
			</div>

			<StaffingFormSection
				idPrefix="edit-"
				values={{
					tourType: form.values.tourType,
					requiredGuides: form.values.requiredGuides,
					requiresVehicle: form.values.requiresVehicle,
					requiresDriver: form.values.requiresDriver,
					requiredVehicleType: form.values.requiredVehicleType,
					staffingOverride: form.values.staffingOverride,
				}}
				set={(key, value) => {
					form.set(key, value as never);
				}}
			/>

			<FormField
				label="Languages"
				hint="Comma-separated codes"
				htmlFor="edit-langs"
			>
				<Input
					id="edit-langs"
					maxLength={200}
					value={form.values.languages}
					onChange={(e) => form.set("languages", e.target.value)}
				/>
			</FormField>

			{(
				[
					["inclusions", "Inclusions"],
					["exclusions", "Exclusions"],
					["highlights", "Highlights"],
				] as const
			).map(([key, label]) => (
				<FormField
					key={key}
					label={label}
					hint="One per line (max 100)"
					htmlFor={`edit-${key}`}
				>
					<Textarea
						id={`edit-${key}`}
						maxLength={5000}
						value={form.values[key] as string}
						onChange={(e) => form.set(key, e.target.value)}
						rows={3}
					/>
				</FormField>
			))}
		</EntityFormPage>
	);
}
