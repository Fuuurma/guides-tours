import { useQuery as useConvexQuery, useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { DetailPage } from "@/components/detail-page";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
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
import {
	MAX_NAME_LEN,
	MAX_NOTES_LEN,
	validateNotesOptional,
	validatePositiveInteger,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FormField } from "../form";

const VEHICLE_TYPES = [
	"minivan",
	"van",
	"bus",
	"car",
	"boat",
	"other",
] as const;
const OWNERSHIP_TYPES = ["owned", "rented", "leased"] as const;
const STATUSES = ["available", "in_use", "maintenance", "retired"] as const;

interface FormValues extends Record<string, unknown> {
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
}

const INITIAL: FormValues = {
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

interface EditVehiclePageProps {
	vehicleId: string;
}

export function EditVehiclePage({ vehicleId }: EditVehiclePageProps) {
	const vehicle = useConvexQuery(api.vehicles.get, {
		vehicleId: vehicleId as Id<"vehicles">,
	});
	const update = useMutation(api.vehicles.update);
	const [loaded, setLoaded] = useState(false);

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const yr = v.year.trim() ? Number(v.year) : undefined;
			await update({
				vehicleId: vehicleId as Id<"vehicles">,
				name: v.name.trim(),
				vehicleType: v.vehicleType,
				capacity: Number(v.capacity),
				licensePlate: v.licensePlate.trim() || undefined,
				make: v.make.trim() || undefined,
				model: v.model.trim() || undefined,
				year: yr,
				color: v.color.trim() || undefined,
				ownershipType: v.ownershipType,
				status: v.status,
				notes: v.notes.trim() || undefined,
			});
			return vehicleId;
		},
		validate: (v) => {
			const errs: Record<string, string> = {};
			const capErr = validatePositiveInteger(v.capacity, "Capacity");
			if (capErr) errs.capacity = capErr;
			const yr = v.year.trim() ? Number(v.year) : undefined;
			if (
				yr !== undefined &&
				(!Number.isFinite(yr) || yr < 1900 || yr > 2100)
			) {
				errs.year = "Year must be between 1900 and 2100";
			}
			const notesErr = validateNotesOptional(v.notes);
			if (notesErr) errs.notes = notesErr;
			return Object.keys(errs).length > 0 ? errs : null;
		},
		initialValues: INITIAL,
		redirectTo: (id) => `/dashboard/vehicles/${id}`,
		successMessage: "Vehicle updated",
	});

	useEffect(() => {
		if (!vehicle || loaded) return;
		form.set("name", vehicle.name);
		form.set("vehicleType", vehicle.vehicleType);
		form.set("capacity", String(vehicle.capacity));
		form.set("licensePlate", vehicle.licensePlate ?? "");
		form.set("make", vehicle.make ?? "");
		form.set("model", vehicle.model ?? "");
		form.set("year", vehicle.year != null ? String(vehicle.year) : "");
		form.set("color", vehicle.color ?? "");
		form.set("ownershipType", vehicle.ownershipType || "owned");
		form.set("status", vehicle.status || "available");
		form.set("notes", vehicle.notes ?? "");
		setLoaded(true);
		// form setters are stable for this page lifecycle
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [vehicle, loaded, form.set]);

	if (vehicle === undefined) {
		return <DetailSkeleton />;
	}
	if (vehicle === null) {
		return (
			<DetailPage title="Vehicle not found" backTo="/dashboard/vehicles" />
		);
	}

	return (
		<EntityFormPage
			form={form}
			title="Edit vehicle"
			description={vehicle.name}
			backTo={`/dashboard/vehicles/${vehicleId}`}
			submitLabel="Save changes"
		>
			<FormField label="Name *" htmlFor="edit-v-name">
				<Input
					id="edit-v-name"
					required
					maxLength={MAX_NAME_LEN}
					value={form.values.name}
					onChange={(e) => form.set("name", e.target.value)}
				/>
			</FormField>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Type" htmlFor="edit-v-type">
					<Select
						value={form.values.vehicleType}
						onValueChange={(v) => form.set("vehicleType", v)}
					>
						<SelectTrigger id="edit-v-type">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{VEHICLE_TYPES.map((t) => (
								<SelectItem key={t} value={t}>
									{t}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FormField>
				<FormField
					label="Capacity *"
					htmlFor="edit-v-cap"
					error={form.fieldErrors.capacity}
				>
					<Input
						id="edit-v-cap"
						type="number"
						min="1"
						required
						value={form.values.capacity}
						onChange={(e) => form.set("capacity", e.target.value)}
					/>
				</FormField>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="License plate" htmlFor="edit-v-plate">
					<Input
						id="edit-v-plate"
						maxLength={20}
						value={form.values.licensePlate}
						onChange={(e) => form.set("licensePlate", e.target.value)}
					/>
				</FormField>
				<FormField label="Ownership" htmlFor="edit-v-own">
					<Select
						value={form.values.ownershipType}
						onValueChange={(v) => form.set("ownershipType", v)}
					>
						<SelectTrigger id="edit-v-own">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{OWNERSHIP_TYPES.map((o) => (
								<SelectItem key={o} value={o}>
									{o}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FormField>
			</div>

			<FormField label="Status" htmlFor="edit-v-status">
				<Select
					value={form.values.status}
					onValueChange={(v) => form.set("status", v)}
				>
					<SelectTrigger id="edit-v-status">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{STATUSES.map((s) => (
							<SelectItem key={s} value={s}>
								{s.replace("_", " ")}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</FormField>

			<div className="grid gap-4 md:grid-cols-3">
				<FormField label="Make" htmlFor="edit-v-make">
					<Input
						id="edit-v-make"
						maxLength={50}
						value={form.values.make}
						onChange={(e) => form.set("make", e.target.value)}
					/>
				</FormField>
				<FormField label="Model" htmlFor="edit-v-model">
					<Input
						id="edit-v-model"
						maxLength={50}
						value={form.values.model}
						onChange={(e) => form.set("model", e.target.value)}
					/>
				</FormField>
				<FormField
					label="Year"
					htmlFor="edit-v-year"
					error={form.fieldErrors.year}
				>
					<Input
						id="edit-v-year"
						type="number"
						min="1900"
						max="2100"
						value={form.values.year}
						onChange={(e) => form.set("year", e.target.value)}
					/>
				</FormField>
			</div>

			<FormField label="Color" htmlFor="edit-v-color">
				<Input
					id="edit-v-color"
					maxLength={30}
					value={form.values.color}
					onChange={(e) => form.set("color", e.target.value)}
				/>
			</FormField>

			<FormField
				label="Notes"
				htmlFor="edit-v-notes"
				error={form.fieldErrors.notes}
			>
				<Textarea
					id="edit-v-notes"
					value={form.values.notes}
					onChange={(e) => form.set("notes", e.target.value)}
					rows={3}
					maxLength={MAX_NOTES_LEN}
				/>
			</FormField>
		</EntityFormPage>
	);
}
