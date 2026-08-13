import { convexQuery } from "@convex-dev/react-query";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageBackLink } from "@/components/detail-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { centsToInputValue } from "@/lib/format";
import { resolveTourStaffing, TOUR_TYPES, VEHICLE_TYPES } from "@/lib/staffing";
import { getErrorMessage } from "@/lib/utils";
import {
	MAX_DESCRIPTION_LEN,
	MAX_NAME_LEN,
	parseUsdToCents,
	validateDescriptionOptional,
	validatePositiveInteger,
	validatePositiveNumber,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const NONE = "__none__";

export type TourFormValues = {
	name: string;
	description: string;
	tourType: string;
	categoryId: string;
	durationHours: string;
	capacity: string;
	minGuests: string;
	maxGuests: string;
	priceUsd: string;
	languages: string;
	requiredGuides: string;
	requiresVehicle: boolean;
	requiresDriver: boolean;
	requiredVehicleType: string;
	staffingOverride: boolean;
	isActive: boolean;
};

export const EMPTY_TOUR_FORM: TourFormValues = {
	name: "",
	description: "",
	tourType: "walking",
	categoryId: "",
	durationHours: "2",
	capacity: "10",
	minGuests: "1",
	maxGuests: "10",
	priceUsd: "",
	languages: "en",
	requiredGuides: "1",
	requiresVehicle: false,
	requiresDriver: false,
	requiredVehicleType: "",
	staffingOverride: false,
	isActive: true,
};

type TourDoc = {
	name: string;
	description?: string;
	tourType: string;
	categoryId?: string;
	durationHours: number;
	capacity: number;
	minGuests: number;
	maxGuests: number;
	isActive: boolean;
	basePriceCents?: number | bigint;
	languages: string[];
	requiredGuides?: number;
	requiresVehicle?: boolean;
	requiresDriver?: boolean;
	requiredVehicleType?: string;
};

export function tourDocToFormValues(tour: TourDoc): TourFormValues {
	const inferred = resolveTourStaffing(tour);
	const hasOverride =
		tour.requiresVehicle !== undefined ||
		tour.requiresDriver !== undefined ||
		Boolean(tour.requiredVehicleType);
	return {
		name: tour.name,
		description: tour.description ?? "",
		tourType: tour.tourType === "walkable" ? "walking" : tour.tourType,
		categoryId: tour.categoryId ?? "",
		durationHours: String(tour.durationHours),
		capacity: String(tour.capacity),
		minGuests: String(tour.minGuests),
		maxGuests: String(tour.maxGuests),
		priceUsd: centsToInputValue(tour.basePriceCents),
		languages: (tour.languages ?? ["en"]).join(", "),
		requiredGuides: String(tour.requiredGuides ?? 1),
		staffingOverride: hasOverride,
		requiresVehicle: tour.requiresVehicle ?? inferred.requiresVehicle,
		requiresDriver: tour.requiresDriver ?? inferred.requiresDriver,
		requiredVehicleType:
			tour.requiredVehicleType ?? inferred.requiredVehicleType ?? "",
		isActive: tour.isActive,
	};
}

export function tourFormToMutationArgs(value: TourFormValues) {
	const inferred = resolveTourStaffing({
		tourType: value.tourType,
		requiredGuides: Number(value.requiredGuides) || 1,
		requiresVehicle: value.staffingOverride ? value.requiresVehicle : undefined,
		requiresDriver: value.staffingOverride ? value.requiresDriver : undefined,
		requiredVehicleType: value.staffingOverride
			? value.requiredVehicleType || undefined
			: undefined,
	});
	const priceCents = value.priceUsd.trim()
		? parseUsdToCents(value.priceUsd)
		: null;
	return {
		name: value.name.trim(),
		description: value.description.trim() || undefined,
		tourType: value.tourType,
		categoryId: value.categoryId
			? (value.categoryId as Id<"tourCategories">)
			: undefined,
		durationHours: Number(value.durationHours),
		capacity: Number(value.capacity),
		minGuests: Number(value.minGuests),
		maxGuests: Number(value.maxGuests),
		basePriceCents: priceCents ?? undefined,
		languages: value.languages
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
		requiredGuides: Number(value.requiredGuides) || 1,
		requiresVehicle: value.staffingOverride ? value.requiresVehicle : undefined,
		requiresDriver: value.staffingOverride ? value.requiresDriver : undefined,
		requiredVehicleType:
			value.staffingOverride && inferred.requiresVehicle
				? value.requiredVehicleType || undefined
				: undefined,
		isActive: value.isActive,
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

export function TourForm({
	mode,
	defaultValues,
	title,
	description,
	backTo,
	submitLabel,
	idPrefix = "",
	onSave,
}: {
	mode: "create" | "edit";
	defaultValues: TourFormValues;
	title: string;
	description: string;
	backTo: string;
	submitLabel: string;
	idPrefix?: string;
	onSave: (value: TourFormValues) => Promise<void>;
}) {
	const { data: categories } = useQuery(
		convexQuery(api.tourCategories.list, {}),
	);
	const [submitErr, setSubmitErr] = useState<string | null>(null);
	const id = (suffix: string) => `${idPrefix}${suffix}`;

	const form = useForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (name: keyof TourFormValues, message: string) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};

			if (!value.name.trim()) fail("name", "Name is required");
			const descErr = validateDescriptionOptional(value.description);
			if (descErr) fail("description", descErr);
			const durErr = validatePositiveNumber(value.durationHours, "Duration");
			if (durErr) fail("durationHours", durErr);
			const capErr = validatePositiveInteger(value.capacity, "Capacity");
			if (capErr) fail("capacity", capErr);
			const minGErr = validatePositiveInteger(value.minGuests, "Min guests");
			if (minGErr) fail("minGuests", minGErr);
			const maxGErr = validatePositiveInteger(value.maxGuests, "Max guests");
			if (maxGErr) fail("maxGuests", maxGErr);
			if (
				!minGErr &&
				!maxGErr &&
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
			if (value.priceUsd.trim()) {
				const cents = parseUsdToCents(value.priceUsd);
				if (cents === null) fail("priceUsd", "Invalid price amount");
			}
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
	const activeCategories = (categories ?? []).filter(
		(c: { isActive: boolean }) => c.isActive,
	);

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
							{mode === "create" ? (
								<Alert>
									<AlertTitle>First step of the week</AlertTitle>
									<AlertDescription>
										A tour is the product. Dates and crew come next — this page
										does not publish anything yet.
									</AlertDescription>
								</Alert>
							) : null}

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
											placeholder="Old Town Walk"
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
											maxLength={MAX_DESCRIPTION_LEN}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											rows={3}
											placeholder="What the team needs to know"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

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

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<form.Field name="categoryId">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={id("category")}>Category</FieldLabel>
											<Select
												value={field.state.value || NONE}
												onValueChange={(v) =>
													field.handleChange(v === NONE ? "" : v)
												}
											>
												<SelectTrigger id={id("category")}>
													<SelectValue placeholder="No category" />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														<SelectItem value={NONE}>No category</SelectItem>
														{activeCategories.map(
															(c: {
																_id: string;
																name: string;
																icon: string;
															}) => (
																<SelectItem key={c._id} value={c._id}>
																	{c.icon ? `${c.icon} ${c.name}` : c.name}
																</SelectItem>
															),
														)}
													</SelectGroup>
												</SelectContent>
											</Select>
											<FieldDescription>
												Optional grouping in your catalog
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

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<form.Field name="priceUsd">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor={id("price")}>
												Base price (USD)
											</FieldLabel>
											<Input
												id={id("price")}
												type="number"
												step="0.01"
												min="0"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="49.00"
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldDescription>Per person, optional</FieldDescription>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="languages">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={id("langs")}>Languages</FieldLabel>
											<Input
												id={id("langs")}
												maxLength={100}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="en, es"
											/>
											<FieldDescription>
												Comma-separated codes (en, es, fr)
											</FieldDescription>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							<FieldSet>
								<FieldLegend>Staffing</FieldLegend>
								<FieldDescription>
									How many guides this tour needs, and whether assignments
									should require a vehicle and driver.
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

							{mode === "edit" ? (
								<form.Field name="isActive">
									{(field) => (
										<Field orientation="horizontal">
											<FieldLabel htmlFor={id("tour-active")}>
												Active on the direct booking link
											</FieldLabel>
											<Switch
												id={id("tour-active")}
												checked={field.state.value}
												onCheckedChange={(checked) =>
													field.handleChange(checked)
												}
											/>
											<FieldDescription>
												Inactive tours stay in the catalog but are hidden from
												the public booking page.
											</FieldDescription>
										</Field>
									)}
								</form.Field>
							) : null}

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
