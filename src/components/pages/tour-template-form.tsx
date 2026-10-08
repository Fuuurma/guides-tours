import { type TourTemplateFormValues } from "./tour-template-form-model";
import { useForm, useStore } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FormSubmitActions } from "@/components/forms/form-submit-actions";
import {
	TemplateCheckboxField,
	TemplateFormHeader,
	TemplateNumberField,
	TemplateStaffingHint,
	TemplateSwitchField,
	TemplateTextareaField,
	TemplateTextField,
	TemplateTypeToggle,
	TemplateVehicleSelect,
} from "@/components/pages/tour-template-fields";
import { validateTourTemplateDraft } from "@/components/pages/tour-template-validation";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	FieldDescription,
	FieldGroup,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { MAX_DESCRIPTION_LEN, MAX_NAME_LEN } from "@/lib/validation";
import { resolveTourStaffing } from "@/lib/staffing";
import { getSafeDisplayMessage } from "@/lib/utils";

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
				setSubmitErr(getSafeDisplayMessage(err));
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
									<FormSubmitActions
										backLink={<Link to={backTo}>Back</Link>}
										canSubmit={canSubmit}
										isSubmitting={isSubmitting}
										submitLabel={submitLabel}
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
