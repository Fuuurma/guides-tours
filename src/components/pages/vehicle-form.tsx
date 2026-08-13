import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageBackLink } from "@/components/detail-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VEHICLE_TYPES } from "@/lib/staffing";
import { getErrorMessage } from "@/lib/utils";
import {
	MAX_NAME_LEN,
	MAX_NOTES_LEN,
	validateNotesOptional,
	validatePositiveInteger,
} from "@/lib/validation";

const OWNERSHIP_TYPES = ["owned", "rented", "leased"] as const;
const STATUSES = ["available", "in_use", "maintenance", "retired"] as const;

export type VehicleFormValues = {
	name: string;
	vehicleType: string;
	capacity: string;
	licensePlate: string;
	make: string;
	model: string;
	year: string;
	color: string;
	ownershipType: string;
	status: string;
	notes: string;
};

export const EMPTY_VEHICLE_FORM: VehicleFormValues = {
	name: "",
	vehicleType: "minivan",
	capacity: "8",
	licensePlate: "",
	make: "",
	model: "",
	year: "",
	color: "",
	ownershipType: "owned",
	status: "available",
	notes: "",
};

type VehicleDoc = {
	name: string;
	vehicleType: string;
	capacity: number;
	licensePlate?: string;
	make?: string;
	model?: string;
	year?: number;
	color?: string;
	ownershipType?: string;
	status?: string;
	notes?: string;
};

export function vehicleDocToFormValues(vehicle: VehicleDoc): VehicleFormValues {
	return {
		name: vehicle.name,
		vehicleType: vehicle.vehicleType,
		capacity: String(vehicle.capacity),
		licensePlate: vehicle.licensePlate ?? "",
		make: vehicle.make ?? "",
		model: vehicle.model ?? "",
		year: vehicle.year != null ? String(vehicle.year) : "",
		color: vehicle.color ?? "",
		ownershipType: vehicle.ownershipType || "owned",
		status: vehicle.status || "available",
		notes: vehicle.notes ?? "",
	};
}

export function vehicleFormToMutationArgs(value: VehicleFormValues) {
	const yr = value.year.trim() ? Number(value.year) : undefined;
	return {
		name: value.name.trim(),
		vehicleType: value.vehicleType,
		capacity: Number(value.capacity),
		licensePlate: value.licensePlate.trim() || undefined,
		make: value.make.trim() || undefined,
		model: value.model.trim() || undefined,
		year: yr,
		color: value.color.trim() || undefined,
		ownershipType: value.ownershipType,
		status: value.status,
		notes: value.notes.trim() || undefined,
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

export function VehicleForm({
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
	defaultValues: VehicleFormValues;
	title: string;
	description: string;
	backTo: string;
	submitLabel: string;
	idPrefix?: string;
	onSave: (value: VehicleFormValues) => Promise<void>;
}) {
	const [submitErr, setSubmitErr] = useState<string | null>(null);
	const id = (suffix: string) => `${idPrefix}${suffix}`;

	const form = useForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (name: keyof VehicleFormValues, message: string) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};

			if (!value.name.trim()) fail("name", "Name is required");
			const capErr = validatePositiveInteger(value.capacity, "Capacity");
			if (capErr) fail("capacity", capErr);
			const yr = value.year.trim() ? Number(value.year) : undefined;
			if (
				yr !== undefined &&
				(!Number.isFinite(yr) || yr < 1900 || yr > 2100)
			) {
				fail("year", "Year must be between 1900 and 2100");
			}
			const notesErr = validateNotesOptional(value.notes);
			if (notesErr) fail("notes", notesErr);
			if (invalid) return;

			try {
				await onSave(value);
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
			}
		},
	});

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
											placeholder="Minivan #1"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<form.Field name="vehicleType">
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
												{VEHICLE_TYPES.map((t) => (
													<ToggleGroupItem key={t} value={t}>
														{t}
													</ToggleGroupItem>
												))}
											</ToggleGroup>
										</Field>
									)}
								</form.Field>
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
											<FieldDescription>
												Seats available for guests
											</FieldDescription>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<form.Field name="licensePlate">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={id("plate")}>
												License plate
											</FieldLabel>
											<Input
												id={id("plate")}
												maxLength={20}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="ABC-1234"
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="ownershipType">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={id("own")}>Ownership</FieldLabel>
											<ToggleGroup
												id={id("own")}
												type="single"
												variant="outline"
												size="sm"
												value={field.state.value}
												onValueChange={(v) => {
													if (v) field.handleChange(v);
												}}
												className="flex-wrap"
											>
												{OWNERSHIP_TYPES.map((o) => (
													<ToggleGroupItem key={o} value={o}>
														{o}
													</ToggleGroupItem>
												))}
											</ToggleGroup>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							{mode === "edit" ? (
								<form.Field name="status">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={id("status")}>Status</FieldLabel>
											<ToggleGroup
												id={id("status")}
												type="single"
												variant="outline"
												size="sm"
												value={field.state.value}
												onValueChange={(v) => {
													if (v) field.handleChange(v);
												}}
												className="flex-wrap"
											>
												{STATUSES.map((s) => (
													<ToggleGroupItem key={s} value={s}>
														{s.replace("_", " ")}
													</ToggleGroupItem>
												))}
											</ToggleGroup>
											<FieldDescription>
												Retired vehicles cannot be assigned.
											</FieldDescription>
										</Field>
									)}
								</form.Field>
							) : null}

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<form.Field name="make">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={id("make")}>Make</FieldLabel>
											<Input
												id={id("make")}
												maxLength={50}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="Mercedes"
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="model">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={id("model")}>Model</FieldLabel>
											<Input
												id={id("model")}
												maxLength={50}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="Sprinter"
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="year">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor={id("year")}>Year</FieldLabel>
											<Input
												id={id("year")}
												type="number"
												min="1900"
												max="2100"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="2022"
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							<form.Field name="color">
								{(field) => (
									<Field>
										<FieldLabel htmlFor={id("color")}>Color</FieldLabel>
										<Input
											id={id("color")}
											maxLength={30}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="White"
										/>
									</Field>
								)}
							</form.Field>

							<form.Field name="notes">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor={id("notes")}>Notes</FieldLabel>
										<Textarea
											id={id("notes")}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											rows={3}
											maxLength={MAX_NOTES_LEN}
											placeholder="Optional"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
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
