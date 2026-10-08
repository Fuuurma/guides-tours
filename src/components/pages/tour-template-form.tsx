import { useForm, useStore } from "@tanstack/react-form";
import { useState } from "react";
import {
	TemplateCheckboxField,
	TemplateFormActions,
	TemplateFormHeader,
	TemplateNumberField,
	TemplateStaffingHint,
	TemplateSwitchField,
	TemplateTextareaField,
	TemplateTextField,
	TemplateTypeToggle,
	TemplateVehicleSelect,
} from "@/components/pages/tour-template-fields";
import {
	type TourTemplateFormValues,
	validateTourTemplateDraft,
} from "@/components/pages/tour-template-validation";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	FieldDescription,
	FieldGroup,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { resolveTourStaffing } from "@/lib/staffing";
import { getErrorMessage } from "@/lib/utils";
import { MAX_DESCRIPTION_LEN, MAX_NAME_LEN } from "@/lib/validation";

export type { TourTemplateFormValues } from "@/components/pages/tour-template-validation";

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

type TemplateDoc = {
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

function splitLines(s: string) {
	return s
		.split("\n")
		.map((x) => x.trim())
		.filter(Boolean)
		.slice(0, 100);
}

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
		description: value.description.trim() || undefined,
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
		requiresVehicle: value.staffingOverride ? value.requiresVehicle : undefined,
		requiresDriver: value.staffingOverride ? value.requiresDriver : undefined,
		requiredVehicleType:
			value.staffingOverride && inferred.requiresVehicle
				? value.requiredVehicleType || undefined
				: undefined,
	};
}

function metaErrors(
	errors: ReadonlyArray<unknown>,
): Array<{ message?: string }> {
	return errors.map((err) => {
		if (typeof err === "string") return { message: err };
		if (err && typeof err === "object" && "message" in err) {
			const message = (err as { message?: unknown }).message;
			if (typeof message === "string") return { message };
		}
		return { message: String(err) };
	});
}

type BindableField = {
	state: {
		value: string;
		meta: { isValid: boolean; errors: ReadonlyArray<unknown> };
	};
	handleChange: (value: string) => void;
	handleBlur: () => void;
};

function bindTemplateField(field: BindableField) {
	return {
		value: field.state.value,
		onChange: field.handleChange,
		onBlur: field.handleBlur,
		invalid: !field.state.meta.isValid,
		errors: metaErrors(field.state.meta.errors),
	};
}

function bindPlainField(field: BindableField) {
	return {
		value: field.state.value,
		onChange: field.handleChange,
		onBlur: field.handleBlur,
	};
}

type StaffingSetter = {
	getFieldValue: (name: "tourType") => string;
	setFieldValue: (
		name: "requiresVehicle" | "requiresDriver" | "requiredVehicleType",
		value: boolean | string,
	) => void;
};

function applyStaffingDefaults(form: StaffingSetter) {
	const next = resolveTourStaffing({
		tourType: form.getFieldValue("tourType"),
	});
	form.setFieldValue("requiresVehicle", next.requiresVehicle);
	form.setFieldValue("requiresDriver", next.requiresDriver);
	form.setFieldValue("requiredVehicleType", next.requiredVehicleType ?? "");
}

type BindableBoolField = {
	state: { value: boolean };
	handleChange: (value: boolean) => void;
};

function bindChecked(field: BindableBoolField) {
	return {
		checked: field.state.value,
		onChange: field.handleChange,
	};
}

function handleFormSubmit(form: { handleSubmit: () => unknown }) {
	return (e: { preventDefault(): void; stopPropagation(): void }) => {
		e.preventDefault();
		e.stopPropagation();
		void form.handleSubmit();
	};
}

export function TourTemplateForm({
	defaultValues,
	title,
	description,
	backTo,
	submitLabel,
	idPrefix = "",
	onSave,
}: {
	defaultValues: TourTemplateFormValues;
	title: string;
	description: string;
	backTo: string;
	submitLabel: string;
	idPrefix?: string;
	onSave: (value: TourTemplateFormValues) => Promise<void>;
}) {
	const id = (suffix: string) => `${idPrefix}${suffix}`;
	const inclusionsId = idPrefix ? `${idPrefix}inclusions` : "incl";
	const exclusionsId = idPrefix ? `${idPrefix}exclusions` : "excl";
	const highlightsId = idPrefix ? `${idPrefix}highlights` : "high";
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			const problems = validateTourTemplateDraft(value);
			for (const { field, message } of problems) {
				form.setFieldMeta(field, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
			}
			if (problems.length > 0) return;

			try {
				await onSave(value);
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
			}
		},
	});

	const tourType = useStore(form.store, (s) => s.values.tourType);
	const staffingOverride = useStore(
		form.store,
		(s) => s.values.staffingOverride,
	);
	const inferred = resolveTourStaffing({ tourType });

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<TemplateFormHeader
				backTo={backTo}
				title={title}
				description={description}
			/>
			<Card>
				<CardContent className="pt-6">
					<form onSubmit={handleFormSubmit(form)}>
						<FieldGroup className="gap-4">
							<form.Field name="name">
								{(field) => (
									<TemplateTextField
										id={id("name")}
										label="Name *"
										required
										maxLength={MAX_NAME_LEN}
										placeholder="City Highlights"
										{...bindTemplateField(field)}
									/>
								)}
							</form.Field>

							<form.Field name="description">
								{(field) => (
									<TemplateTextareaField
										id={id("desc")}
										label="Description"
										rows={3}
										maxLength={MAX_DESCRIPTION_LEN}
										placeholder="Optional"
										{...bindTemplateField(field)}
									/>
								)}
							</form.Field>

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<form.Field name="tourType">
									{(field) => (
										<TemplateTypeToggle
											id={id("type")}
											value={field.state.value}
											onChange={(v) => {
												if (v) field.handleChange(v);
											}}
										/>
									)}
								</form.Field>
								<form.Field name="durationHours">
									{(field) => (
										<TemplateNumberField
											id={id("dur")}
											label="Duration (hours) *"
											step="0.5"
											min="0.5"
											required
											{...bindTemplateField(field)}
										/>
									)}
								</form.Field>
							</FieldGroup>

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<form.Field name="capacity">
									{(field) => (
										<TemplateNumberField
											id={id("cap")}
											label="Capacity *"
											min="1"
											required
											{...bindTemplateField(field)}
										/>
									)}
								</form.Field>
								<form.Field name="minGuests">
									{(field) => (
										<TemplateNumberField
											id={id("min")}
											label="Min guests"
											min="1"
											{...bindTemplateField(field)}
										/>
									)}
								</form.Field>
								<form.Field name="maxGuests">
									{(field) => (
										<TemplateNumberField
											id={id("max")}
											label="Max guests"
											min="1"
											{...bindTemplateField(field)}
										/>
									)}
								</form.Field>
							</FieldGroup>

							<FieldSet>
								<FieldLegend>Staffing</FieldLegend>
								<FieldDescription>
									Copied onto tours created from this template.
								</FieldDescription>
								<FieldGroup className="gap-4">
									<form.Field name="requiredGuides">
										{(field) => (
											<TemplateNumberField
												id={id("req-guides")}
												label="Required guides"
												min="1"
												max="10"
												{...bindTemplateField(field)}
											/>
										)}
									</form.Field>
									<form.Field name="staffingOverride">
										{(field) => (
											<TemplateSwitchField
												id={id("staffing-override")}
												label="Customize vehicle/driver rules"
												checked={field.state.value}
												onChange={(checked) => {
													field.handleChange(checked);
													if (checked) applyStaffingDefaults(form);
												}}
											/>
										)}
									</form.Field>
									{staffingOverride ? (
										<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
											<form.Field name="requiresVehicle">
												{(field) => (
													<TemplateCheckboxField
														id={id("requires-vehicle")}
														label="Requires vehicle"
														{...bindChecked(field)}
													/>
												)}
											</form.Field>
											<form.Field name="requiresDriver">
												{(field) => (
													<TemplateCheckboxField
														id={id("requires-driver")}
														label="Requires driver"
														{...bindChecked(field)}
													/>
												)}
											</form.Field>
											<form.Field name="requiredVehicleType">
												{(field) => (
													<TemplateVehicleSelect
														id={id("req-vtype")}
														label="Required vehicle type"
														value={field.state.value}
														onChange={field.handleChange}
													/>
												)}
											</form.Field>
										</FieldGroup>
									) : (
										<TemplateStaffingHint
											requiresVehicle={inferred.requiresVehicle}
											vehicleType={inferred.requiredVehicleType}
										/>
									)}
								</FieldGroup>
							</FieldSet>

							<form.Field name="languages">
								{(field) => (
									<TemplateTextField
										id={id("langs")}
										label="Languages"
										maxLength={200}
										placeholder="en, es, fr"
										description="Comma-separated codes (en, es, fr)"
										{...bindPlainField(field)}
									/>
								)}
							</form.Field>

							<form.Field name="inclusions">
								{(field) => (
									<TemplateTextareaField
										id={inclusionsId}
										label="Inclusions"
										rows={3}
										maxLength={5000}
										placeholder={"Lunch\nGuide"}
										description="One per line (max 100)"
										{...bindPlainField(field)}
									/>
								)}
							</form.Field>
							<form.Field name="exclusions">
								{(field) => (
									<TemplateTextareaField
										id={exclusionsId}
										label="Exclusions"
										rows={3}
										maxLength={5000}
										placeholder={"Flights\nVisa"}
										description="One per line (max 100)"
										{...bindPlainField(field)}
									/>
								)}
							</form.Field>
							<form.Field name="highlights">
								{(field) => (
									<TemplateTextareaField
										id={highlightsId}
										label="Highlights"
										rows={3}
										maxLength={5000}
										placeholder={"Old Town\nRiver cruise"}
										description="One per line (max 100)"
										{...bindPlainField(field)}
									/>
								)}
							</form.Field>

							{submitErr ? <ErrorBanner message={submitErr} /> : null}

							<form.Subscribe
								selector={(state) =>
									[state.canSubmit, state.isSubmitting] as const
								}
							>
								{([canSubmit, isSubmitting]) => (
									<TemplateFormActions
										backTo={backTo}
										submitLabel={submitLabel}
										canSubmit={canSubmit}
										isSubmitting={isSubmitting}
									/>
								)}
							</form.Subscribe>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
