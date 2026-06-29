import { useMutation } from "convex/react";
import { useState } from "react";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	MAX_NAME_LEN,
	MAX_NOTES_LEN,
	validateNotesOptional,
	validatePositiveInteger,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
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
	notes: "",
};

export function NewVehiclePage() {
	const create = useMutation(api.vehicles.create);
	const [capErr, setCapErr] = useState<string | null>(null);
	const [yearErr, setYearErr] = useState<string | null>(null);
	const [notesErr, setNotesErr] = useState<string | null>(null);

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const capError = validatePositiveInteger(v.capacity, "Capacity");
			setCapErr(capError);
			const yr = v.year.trim() ? Number(v.year) : undefined;
			let yearError: string | null = null;
			if (
				yr !== undefined &&
				(!Number.isFinite(yr) || yr < 1900 || yr > 2100)
			) {
				yearError = "Year must be between 1900 and 2100";
			}
			setYearErr(yearError);
			const notesError = validateNotesOptional(v.notes);
			setNotesErr(notesError);
			if (capError || yearError || notesError) {
				throw new Error(capError ?? yearError ?? notesError ?? "Invalid input");
			}
			const id = await create({
				name: v.name.trim(),
				vehicleType: v.vehicleType,
				capacity: Number(v.capacity),
				licensePlate: v.licensePlate.trim() || undefined,
				make: v.make.trim() || undefined,
				model: v.model.trim() || undefined,
				year: yr,
				color: v.color.trim() || undefined,
				ownershipType: v.ownershipType,
				notes: v.notes.trim() || undefined,
			});
			return id;
		},
		initialValues: INITIAL,
		redirectTo: (id) => `/dashboard/vehicles/${id}`,
		successMessage: "Vehicle created",
	});

	return (
		<EntityFormPage
			form={form}
			title="New vehicle"
			description="Add a vehicle to your fleet"
			backTo="/dashboard/vehicles"
			submitLabel="Create vehicle"
		>
			<FormField label="Name *" htmlFor="name">
				<Input
					id="name"
					required
					maxLength={MAX_NAME_LEN}
					value={form.values.name}
					onChange={(e) => form.set("name", e.target.value)}
					placeholder="Minivan #1"
				/>
			</FormField>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Type" htmlFor="type">
					<Select
						value={form.values.vehicleType}
						onValueChange={(v) => form.set("vehicleType", v)}
					>
						<SelectTrigger id="type">
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
				<FormField label="Capacity *" htmlFor="cap" error={capErr ?? undefined}>
					<Input
						id="cap"
						type="number"
						min="1"
						required
						value={form.values.capacity}
						onChange={(e) => {
							form.set("capacity", e.target.value);
							if (capErr) setCapErr(null);
						}}
					/>
				</FormField>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="License plate" htmlFor="plate">
					<Input
						id="plate"
						maxLength={20}
						value={form.values.licensePlate}
						onChange={(e) => form.set("licensePlate", e.target.value)}
						placeholder="ABC-1234"
					/>
				</FormField>
				<FormField label="Ownership" htmlFor="own">
					<Select
						value={form.values.ownershipType}
						onValueChange={(v) => form.set("ownershipType", v)}
					>
						<SelectTrigger id="own">
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

			<div className="grid gap-4 md:grid-cols-3">
				<FormField label="Make" htmlFor="make">
					<Input
						id="make"
						maxLength={50}
						value={form.values.make}
						onChange={(e) => form.set("make", e.target.value)}
						placeholder="Mercedes"
					/>
				</FormField>
				<FormField label="Model" htmlFor="model">
					<Input
						id="model"
						maxLength={50}
						value={form.values.model}
						onChange={(e) => form.set("model", e.target.value)}
						placeholder="Sprinter"
					/>
				</FormField>
				<FormField label="Year" htmlFor="year" error={yearErr ?? undefined}>
					<Input
						id="year"
						type="number"
						min="1900"
						max="2100"
						value={form.values.year}
						onChange={(e) => {
							form.set("year", e.target.value);
							if (yearErr) setYearErr(null);
						}}
						placeholder="2022"
					/>
				</FormField>
			</div>

			<FormField label="Color" htmlFor="color">
				<Input
					id="color"
					maxLength={30}
					value={form.values.color}
					onChange={(e) => form.set("color", e.target.value)}
					placeholder="White"
				/>
			</FormField>

			<FormField label="Notes" htmlFor="notes" error={notesErr ?? undefined}>
				<Textarea
					id="notes"
					value={form.values.notes}
					onChange={(e) => {
						form.set("notes", e.target.value);
						if (notesErr) setNotesErr(null);
					}}
					rows={3}
					maxLength={MAX_NOTES_LEN}
					placeholder="Optional"
				/>
			</FormField>
		</EntityFormPage>
	);
}
