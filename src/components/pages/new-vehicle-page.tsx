import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { FormField } from "../form";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";

const VEHICLE_TYPES = ["minivan", "van", "bus", "car", "boat", "other"] as const;
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
	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const cap = Number(v.capacity);
			const yr = v.year ? Number(v.year) : undefined;
			if (cap <= 0) throw new Error("Capacity must be positive");
			if (yr !== undefined && (yr < 1900 || yr > 2100))
				throw new Error("Year must be between 1900 and 2100");
			const id = await create({
				name: v.name,
				vehicleType: v.vehicleType,
				capacity: cap,
				licensePlate: v.licensePlate || undefined,
				make: v.make || undefined,
				model: v.model || undefined,
				year: yr,
				color: v.color || undefined,
				ownershipType: v.ownershipType,
				notes: v.notes || undefined,
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
					value={form.values.name}
					onChange={(e) => form.set("name", e.target.value)}
					placeholder="Minivan #1"
				/>
			</FormField>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Type" htmlFor="type">
					<Select value={form.values.vehicleType} onValueChange={(v) => form.set("vehicleType", v)}>
						<SelectTrigger id="type"><SelectValue /></SelectTrigger>
						<SelectContent>
							{VEHICLE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
						</SelectContent>
					</Select>
				</FormField>
				<FormField label="Capacity *" htmlFor="cap">
					<Input id="cap" type="number" min="1" required value={form.values.capacity} onChange={(e) => form.set("capacity", e.target.value)} />
				</FormField>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="License plate" htmlFor="plate">
					<Input id="plate" value={form.values.licensePlate} onChange={(e) => form.set("licensePlate", e.target.value)} placeholder="ABC-1234" />
				</FormField>
				<FormField label="Ownership" htmlFor="own">
					<Select value={form.values.ownershipType} onValueChange={(v) => form.set("ownershipType", v)}>
						<SelectTrigger id="own"><SelectValue /></SelectTrigger>
						<SelectContent>
							{OWNERSHIP_TYPES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
						</SelectContent>
					</Select>
				</FormField>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<FormField label="Make" htmlFor="make">
					<Input id="make" value={form.values.make} onChange={(e) => form.set("make", e.target.value)} placeholder="Mercedes" />
				</FormField>
				<FormField label="Model" htmlFor="model">
					<Input id="model" value={form.values.model} onChange={(e) => form.set("model", e.target.value)} placeholder="Sprinter" />
				</FormField>
				<FormField label="Year" htmlFor="year">
					<Input id="year" type="number" min="1900" max="2100" value={form.values.year} onChange={(e) => form.set("year", e.target.value)} placeholder="2022" />
				</FormField>
			</div>

			<FormField label="Color" htmlFor="color">
				<Input id="color" value={form.values.color} onChange={(e) => form.set("color", e.target.value)} placeholder="White" />
			</FormField>

			<FormField label="Notes" htmlFor="notes">
				<Textarea id="notes" value={form.values.notes} onChange={(e) => form.set("notes", e.target.value)} rows={3} placeholder="Optional" />
			</FormField>
		</EntityFormPage>
	);
}
