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
	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const dur = Number(v.durationHours);
			const cap = Number(v.capacity);
			const minG = Number(v.minGuests);
			const maxG = Number(v.maxGuests);
			if (dur <= 0 || cap <= 0 || minG <= 0 || maxG <= 0) throw new Error("Numeric fields must be positive");
			if (minG > maxG) throw new Error("minGuests cannot exceed maxGuests");
			const split = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
			const id = await create({
				name: v.name,
				description: v.description || undefined,
				tourType: v.tourType,
				durationHours: dur,
				capacity: cap,
				minGuests: minG,
				maxGuests: maxG,
				languages: v.languages.split(",").map((s) => s.trim()).filter(Boolean),
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
				<Input id="name" required value={form.values.name} onChange={(e) => form.set("name", e.target.value)} placeholder="City Highlights" />
			</FormField>

			<FormField label="Description" htmlFor="desc">
				<Textarea id="desc" value={form.values.description} onChange={(e) => form.set("description", e.target.value)} rows={3} placeholder="Optional" />
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
				<FormField label="Duration (hours) *" htmlFor="dur">
					<Input id="dur" type="number" step="0.5" min="0.5" required value={form.values.durationHours} onChange={(e) => form.set("durationHours", e.target.value)} />
				</FormField>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<FormField label="Capacity *" htmlFor="cap">
					<Input id="cap" type="number" min="1" required value={form.values.capacity} onChange={(e) => form.set("capacity", e.target.value)} />
				</FormField>
				<FormField label="Min guests" htmlFor="min">
					<Input id="min" type="number" min="1" value={form.values.minGuests} onChange={(e) => form.set("minGuests", e.target.value)} />
				</FormField>
				<FormField label="Max guests" htmlFor="max">
					<Input id="max" type="number" min="1" value={form.values.maxGuests} onChange={(e) => form.set("maxGuests", e.target.value)} />
				</FormField>
			</div>

			<FormField label="Languages" hint="Comma-separated codes" htmlFor="langs">
				<Input id="langs" value={form.values.languages} onChange={(e) => form.set("languages", e.target.value)} placeholder="en, es, fr" />
			</FormField>

			<FormField label="Inclusions" hint="One per line" htmlFor="incl">
				<Textarea id="incl" value={form.values.inclusions} onChange={(e) => form.set("inclusions", e.target.value)} rows={3} placeholder="Lunch&#10;Guide" />
			</FormField>

			<FormField label="Exclusions" hint="One per line" htmlFor="excl">
				<Textarea id="excl" value={form.values.exclusions} onChange={(e) => form.set("exclusions", e.target.value)} rows={3} placeholder="Flights&#10;Visa" />
			</FormField>

			<FormField label="Highlights" hint="One per line" htmlFor="high">
				<Textarea id="high" value={form.values.highlights} onChange={(e) => form.set("highlights", e.target.value)} rows={3} placeholder="Old Town&#10;River cruise" />
			</FormField>
		</EntityFormPage>
	);
}
