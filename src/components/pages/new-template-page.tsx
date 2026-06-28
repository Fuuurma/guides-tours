import { useMutation } from "convex/react";
import { useState } from "react";
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
import {
	MAX_DESCRIPTION_LEN,
	MAX_NAME_LEN,
	validateDescriptionOptional,
	validatePositiveInteger,
	validatePositiveNumber,
} from "@/lib/validation";

const TOUR_TYPES = ["walking", "car", "minivan", "bus", "boat", "other"] as const;

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
}

const INITIAL: FormValues = {
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
};

export function NewTemplatePage() {
	const create = useMutation(api.tourTemplates.create);
	const [durErr, setDurErr] = useState<string | null>(null);
	const [capErr, setCapErr] = useState<string | null>(null);
	const [minErr, setMinErr] = useState<string | null>(null);
	const [maxErr, setMaxErr] = useState<string | null>(null);
	const [descErr, setDescErr] = useState<string | null>(null);

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const durError = validatePositiveNumber(v.durationHours, "Duration");
			const capError = validatePositiveInteger(v.capacity, "Capacity");
			const minError = validatePositiveInteger(v.minGuests, "Min guests");
			const maxError = validatePositiveInteger(v.maxGuests, "Max guests");
			setDurErr(durError);
			setCapErr(capError);
			setMinErr(minError);
			setMaxErr(maxError);
			if (durError || capError || minError || maxError) {
				throw new Error(durError ?? capError ?? minError ?? maxError ?? "Invalid input");
			}
			const minG = Number(v.minGuests);
			const maxG = Number(v.maxGuests);
			if (minG > maxG) {
				const msg = "minGuests cannot exceed maxGuests";
				setMinErr(msg);
				throw new Error(msg);
			}
			const descError = validateDescriptionOptional(v.description);
			setDescErr(descError);
			if (descError) throw new Error(descError);
			const split = (s: string) =>
				s.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 100);
			const id = await create({
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
			});
			return id;
		},
		initialValues: INITIAL,
		redirectTo: (id) => `/dashboard/templates/${id}`,
		successMessage: "Template created",
	});

	return (
		<EntityFormPage
			form={form}
			title="New tour template"
			description="Reusable defaults for spinning up tours"
			backTo="/dashboard/templates"
			submitLabel="Create template"
		>
			<FormField label="Name *" htmlFor="name">
				<Input id="name" required maxLength={MAX_NAME_LEN} value={form.values.name} onChange={(e) => form.set("name", e.target.value)} placeholder="City Highlights" />
			</FormField>

			<FormField label="Description" htmlFor="desc" error={descErr ?? undefined}>
				<Textarea
					id="desc"
					value={form.values.description}
					onChange={(e) => {
						form.set("description", e.target.value);
						if (descErr) setDescErr(null);
					}}
					rows={3}
					maxLength={MAX_DESCRIPTION_LEN}
					placeholder="Optional"
				/>
			</FormField>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Type" htmlFor="type">
					<Select value={form.values.tourType} onValueChange={(v) => form.set("tourType", v)}>
						<SelectTrigger id="type"><SelectValue /></SelectTrigger>
						<SelectContent>
							{TOUR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
						</SelectContent>
					</Select>
				</FormField>
				<FormField label="Duration (hours) *" htmlFor="dur" error={durErr ?? undefined}>
					<Input
						id="dur"
						type="number"
						step="0.5"
						min="0.5"
						required
						value={form.values.durationHours}
						onChange={(e) => {
							form.set("durationHours", e.target.value);
							if (durErr) setDurErr(null);
						}}
					/>
				</FormField>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
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
				<FormField label="Min guests" htmlFor="min" error={minErr ?? undefined}>
					<Input
						id="min"
						type="number"
						min="1"
						value={form.values.minGuests}
						onChange={(e) => {
							form.set("minGuests", e.target.value);
							if (minErr) setMinErr(null);
						}}
					/>
				</FormField>
				<FormField label="Max guests" htmlFor="max" error={maxErr ?? undefined}>
					<Input
						id="max"
						type="number"
						min="1"
						value={form.values.maxGuests}
						onChange={(e) => {
							form.set("maxGuests", e.target.value);
							if (maxErr) setMaxErr(null);
						}}
					/>
				</FormField>
			</div>

			<FormField label="Languages" hint="Comma-separated codes" htmlFor="langs">
				<Input id="langs" maxLength={200} value={form.values.languages} onChange={(e) => form.set("languages", e.target.value)} placeholder="en, es, fr" />
			</FormField>

			<FormField label="Inclusions" hint="One per line (max 100)" htmlFor="incl">
				<Textarea id="incl" maxLength={5000} value={form.values.inclusions} onChange={(e) => form.set("inclusions", e.target.value)} rows={3} placeholder={"Lunch\nGuide"} />
			</FormField>

			<FormField label="Exclusions" hint="One per line (max 100)" htmlFor="excl">
				<Textarea id="excl" maxLength={5000} value={form.values.exclusions} onChange={(e) => form.set("exclusions", e.target.value)} rows={3} placeholder={"Flights\nVisa"} />
			</FormField>

			<FormField label="Highlights" hint="One per line (max 100)" htmlFor="high">
				<Textarea id="high" maxLength={5000} value={form.values.highlights} onChange={(e) => form.set("highlights", e.target.value)} rows={3} placeholder={"Old Town\nRiver cruise"} />
			</FormField>
		</EntityFormPage>
	);
}
