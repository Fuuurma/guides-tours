import { useMutation } from "convex/react";
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
	MAX_DESCRIPTION_LEN,
	MAX_NAME_LEN,
	validateDescriptionOptional,
	validatePositiveInteger,
	validatePositiveNumber,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import { FormField } from "../form";

const TOUR_TYPES = [
	"walking",
	"car",
	"minivan",
	"bus",
	"boat",
	"other",
] as const;

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
			const minG = Number(v.minGuests);
			const maxG = Number(v.maxGuests);
			if (minG > maxG) {
				throw new Error("minGuests cannot exceed maxGuests");
			}
			const split = (s: string) =>
				s
					.split("\n")
					.map((x) => x.trim())
					.filter(Boolean)
					.slice(0, 100);
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
		validate: (v) => {
			const errs: Record<string, string> = {};
			const durErr = validatePositiveNumber(v.durationHours, "Duration");
			if (durErr) errs.durationHours = durErr;
			const capErr = validatePositiveInteger(v.capacity, "Capacity");
			if (capErr) errs.capacity = capErr;
			const minErr = validatePositiveInteger(v.minGuests, "Min guests");
			if (minErr) errs.minGuests = minErr;
			const maxErr = validatePositiveInteger(v.maxGuests, "Max guests");
			if (maxErr) errs.maxGuests = maxErr;
			if (!minErr && !maxErr && Number(v.minGuests) > Number(v.maxGuests)) {
				errs.minGuests = "minGuests cannot exceed maxGuests";
				errs.maxGuests = "minGuests cannot exceed maxGuests";
			}
			const descErr = validateDescriptionOptional(v.description);
			if (descErr) errs.description = descErr;
			return Object.keys(errs).length > 0 ? errs : null;
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
				<Input
					id="name"
					required
					maxLength={MAX_NAME_LEN}
					value={form.values.name}
					onChange={(e) => form.set("name", e.target.value)}
					placeholder="City Highlights"
				/>
			</FormField>

			<FormField
				label="Description"
				htmlFor="desc"
				error={form.fieldErrors.description}
			>
				<Textarea
					id="desc"
					value={form.values.description}
					onChange={(e) => form.set("description", e.target.value)}
					rows={3}
					maxLength={MAX_DESCRIPTION_LEN}
					placeholder="Optional"
				/>
			</FormField>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Type" htmlFor="type">
					<Select
						value={form.values.tourType}
						onValueChange={(v) => form.set("tourType", v)}
					>
						<SelectTrigger id="type">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TOUR_TYPES.map((t) => (
								<SelectItem key={t} value={t}>
									{t}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FormField>
				<FormField
					label="Duration (hours) *"
					htmlFor="dur"
					error={form.fieldErrors.durationHours}
				>
					<Input
						id="dur"
						type="number"
						step="0.5"
						min="0.5"
						required
						value={form.values.durationHours}
						onChange={(e) => form.set("durationHours", e.target.value)}
					/>
				</FormField>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<FormField
					label="Capacity *"
					htmlFor="cap"
					error={form.fieldErrors.capacity}
				>
					<Input
						id="cap"
						type="number"
						min="1"
						required
						value={form.values.capacity}
						onChange={(e) => form.set("capacity", e.target.value)}
					/>
				</FormField>
				<FormField
					label="Min guests"
					htmlFor="min"
					error={form.fieldErrors.minGuests}
				>
					<Input
						id="min"
						type="number"
						min="1"
						value={form.values.minGuests}
						onChange={(e) => form.set("minGuests", e.target.value)}
					/>
				</FormField>
				<FormField
					label="Max guests"
					htmlFor="max"
					error={form.fieldErrors.maxGuests}
				>
					<Input
						id="max"
						type="number"
						min="1"
						value={form.values.maxGuests}
						onChange={(e) => form.set("maxGuests", e.target.value)}
					/>
				</FormField>
			</div>

			<FormField label="Languages" hint="Comma-separated codes" htmlFor="langs">
				<Input
					id="langs"
					maxLength={200}
					value={form.values.languages}
					onChange={(e) => form.set("languages", e.target.value)}
					placeholder="en, es, fr"
				/>
			</FormField>

			<FormField
				label="Inclusions"
				hint="One per line (max 100)"
				htmlFor="incl"
			>
				<Textarea
					id="incl"
					maxLength={5000}
					value={form.values.inclusions}
					onChange={(e) => form.set("inclusions", e.target.value)}
					rows={3}
					placeholder={"Lunch\nGuide"}
				/>
			</FormField>

			<FormField
				label="Exclusions"
				hint="One per line (max 100)"
				htmlFor="excl"
			>
				<Textarea
					id="excl"
					maxLength={5000}
					value={form.values.exclusions}
					onChange={(e) => form.set("exclusions", e.target.value)}
					rows={3}
					placeholder={"Flights\nVisa"}
				/>
			</FormField>

			<FormField
				label="Highlights"
				hint="One per line (max 100)"
				htmlFor="high"
			>
				<Textarea
					id="high"
					maxLength={5000}
					value={form.values.highlights}
					onChange={(e) => form.set("highlights", e.target.value)}
					rows={3}
					placeholder={"Old Town\nRiver cruise"}
				/>
			</FormField>
		</EntityFormPage>
	);
}
