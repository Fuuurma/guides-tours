import { useForm, useStore } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageBackLink } from "@/components/detail-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { resolveTourStaffing, TOUR_TYPES, VEHICLE_TYPES } from "@/lib/staffing";
import { getErrorMessage } from "@/lib/utils";
import {
	MAX_DESCRIPTION_LEN,
	MAX_NAME_LEN,
	validateDescriptionOptional,
	validateName,
	validatePositiveInteger,
	validatePositiveNumber,
} from "@/lib/validation";

export type TourTemplateFormValues = {
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
};

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
			let invalid = false;
			const fail = (name: keyof TourTemplateFormValues, message: string) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};

			const nameErr = validateName(value.name);
			if (nameErr) fail("name", nameErr);
			const descErr = validateDescriptionOptional(value.description);
			if (descErr) fail("description", descErr);
			const durErr = validatePositiveNumber(value.durationHours, "Duration");
			if (durErr) fail("durationHours", durErr);
			const capErr = validatePositiveInteger(value.capacity, "Capacity");
			if (capErr) fail("capacity", capErr);
			const minErr = validatePositiveInteger(value.minGuests, "Min guests");
			if (minErr) fail("minGuests", minErr);
			const maxErr = validatePositiveInteger(value.maxGuests, "Max guests");
			if (maxErr) fail("maxGuests", maxErr);
			if (
				!minErr &&
				!maxErr &&
				Number(value.minGuests) > Number(value.maxGuests)
			) {
				fail("minGuests", "Min guests cannot exceed max guests");
				fail("maxGuests", "Min guests cannot exceed max guests");
			}
			const guidesErr = validatePositiveInteger(
				value.requiredGuides,
				"Required guides",
			);
			if (guidesErr) fail("requiredGuides", guidesErr);
			if (invalid) return;

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
			<div>
				<PageBackLink to={backTo} />
				<h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{description}</p>
			</div>
			<Card>
				<CardContent className="pt-6">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							void form.handleSubmit();
						}}
					>
						<FieldGroup className="gap-4">
							<form.Field name="name">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor={id("name")}>Name *</FieldLabel>
										<Input
											id={id("name")}
											required
											maxLength={MAX_NAME_LEN}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="City Highlights"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<form.Field name="description">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor={id("desc")}>Description</FieldLabel>
										<Textarea
											id={id("desc")}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											rows={3}
											maxLength={MAX_DESCRIPTION_LEN}
											placeholder="Optional"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<form.Field name="tourType">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={id("type")}>Type</FieldLabel>
											<ToggleGroup
												id={id("type")}
												type="single"
												variant="outline"
												size="sm"
												value={field.state.value}
												onValueChange={(v) => {
													if (v) field.handleChange(v);
												}}
												className="flex-wrap"
											>
												{TOUR_TYPES.map((t) => (
													<ToggleGroupItem key={t} value={t}>
														{t}
													</ToggleGroupItem>
												))}
											</ToggleGroup>
											<FieldDescription>
												Transport types default to needing a vehicle and driver.
											</FieldDescription>
										</Field>
									)}
								</form.Field>
								<form.Field name="durationHours">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor={id("dur")}>
												Duration (hours) *
											</FieldLabel>
											<Input
												id={id("dur")}
												type="number"
												step="0.5"
												min="0.5"
												required
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<form.Field name="capacity">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor={id("cap")}>Capacity *</FieldLabel>
											<Input
												id={id("cap")}
												type="number"
												min="1"
												required
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="minGuests">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor={id("min")}>Min guests</FieldLabel>
											<Input
												id={id("min")}
												type="number"
												min="1"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="maxGuests">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor={id("max")}>Max guests</FieldLabel>
											<Input
												id={id("max")}
												type="number"
												min="1"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
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
											<Field data-invalid={!field.state.meta.isValid}>
												<FieldLabel htmlFor={id("req-guides")}>
													Required guides
												</FieldLabel>
												<Input
													id={id("req-guides")}
													type="number"
													min="1"
													max="10"
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
													aria-invalid={!field.state.meta.isValid}
												/>
												<FieldError
													errors={metaErrors(field.state.meta.errors)}
												/>
											</Field>
										)}
									</form.Field>
									<form.Field name="staffingOverride">
										{(field) => (
											<Field orientation="horizontal">
												<FieldLabel htmlFor={id("staffing-override")}>
													Customize vehicle/driver rules
												</FieldLabel>
												<Switch
													id={id("staffing-override")}
													checked={field.state.value}
													onCheckedChange={(checked) => {
														field.handleChange(checked);
														if (!checked) return;
														const next = resolveTourStaffing({
															tourType: form.getFieldValue("tourType"),
														});
														form.setFieldValue(
															"requiresVehicle",
															next.requiresVehicle,
														);
														form.setFieldValue(
															"requiresDriver",
															next.requiresDriver,
														);
														form.setFieldValue(
															"requiredVehicleType",
															next.requiredVehicleType ?? "",
														);
													}}
												/>
											</Field>
										)}
									</form.Field>
									{staffingOverride ? (
										<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
											<form.Field name="requiresVehicle">
												{(field) => (
													<Field orientation="horizontal">
														<Checkbox
															id={id("requires-vehicle")}
															checked={field.state.value}
															onCheckedChange={(c) =>
																field.handleChange(c === true)
															}
														/>
														<FieldLabel htmlFor={id("requires-vehicle")}>
															Requires vehicle
														</FieldLabel>
													</Field>
												)}
											</form.Field>
											<form.Field name="requiresDriver">
												{(field) => (
													<Field orientation="horizontal">
														<Checkbox
															id={id("requires-driver")}
															checked={field.state.value}
															onCheckedChange={(c) =>
																field.handleChange(c === true)
															}
														/>
														<FieldLabel htmlFor={id("requires-driver")}>
															Requires driver
														</FieldLabel>
													</Field>
												)}
											</form.Field>
											<form.Field name="requiredVehicleType">
												{(field) => (
													<Field>
														<FieldLabel htmlFor={id("req-vtype")}>
															Required vehicle type
														</FieldLabel>
														<Select
															value={field.state.value || "__any__"}
															onValueChange={(v) =>
																field.handleChange(v === "__any__" ? "" : v)
															}
														>
															<SelectTrigger id={id("req-vtype")}>
																<SelectValue placeholder="Any" />
															</SelectTrigger>
															<SelectContent>
																<SelectGroup>
																	<SelectItem value="__any__">Any</SelectItem>
																	{VEHICLE_TYPES.map((t) => (
																		<SelectItem key={t} value={t}>
																			{t}
																		</SelectItem>
																	))}
																</SelectGroup>
															</SelectContent>
														</Select>
													</Field>
												)}
											</form.Field>
										</FieldGroup>
									) : (
										<p className="text-xs text-muted-foreground">
											{inferred.requiresVehicle
												? `Inferred: needs ${inferred.requiredVehicleType ?? "a vehicle"} + driver`
												: "Inferred: walking / no fleet required"}
										</p>
									)}
								</FieldGroup>
							</FieldSet>

							<form.Field name="languages">
								{(field) => (
									<Field>
										<FieldLabel htmlFor={id("langs")}>Languages</FieldLabel>
										<Input
											id={id("langs")}
											maxLength={200}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="en, es, fr"
										/>
										<FieldDescription>
											Comma-separated codes (en, es, fr)
										</FieldDescription>
									</Field>
								)}
							</form.Field>

							<form.Field name="inclusions">
								{(field) => (
									<Field>
										<FieldLabel htmlFor={inclusionsId}>Inclusions</FieldLabel>
										<Textarea
											id={inclusionsId}
											maxLength={5000}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											rows={3}
											placeholder={"Lunch\nGuide"}
										/>
										<FieldDescription>One per line (max 100)</FieldDescription>
									</Field>
								)}
							</form.Field>
							<form.Field name="exclusions">
								{(field) => (
									<Field>
										<FieldLabel htmlFor={exclusionsId}>Exclusions</FieldLabel>
										<Textarea
											id={exclusionsId}
											maxLength={5000}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											rows={3}
											placeholder={"Flights\nVisa"}
										/>
										<FieldDescription>One per line (max 100)</FieldDescription>
									</Field>
								)}
							</form.Field>
							<form.Field name="highlights">
								{(field) => (
									<Field>
										<FieldLabel htmlFor={highlightsId}>Highlights</FieldLabel>
										<Textarea
											id={highlightsId}
											maxLength={5000}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											rows={3}
											placeholder={"Old Town\nRiver cruise"}
										/>
										<FieldDescription>One per line (max 100)</FieldDescription>
									</Field>
								)}
							</form.Field>

							{submitErr ? <ErrorBanner message={submitErr} /> : null}

							<form.Subscribe
								selector={(state) =>
									[state.canSubmit, state.isSubmitting] as const
								}
							>
								{([canSubmit, isSubmitting]) => (
									<div className="flex justify-end gap-2 pt-2">
										<Button type="button" variant="outline" asChild>
											<Link to={backTo}>Back</Link>
										</Button>
										<Button type="submit" disabled={!canSubmit || isSubmitting}>
											{isSubmitting ? (
												<Spinner data-icon="inline-start" />
											) : null}
											{isSubmitting ? "Saving…" : submitLabel}
										</Button>
									</div>
								)}
							</form.Subscribe>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
