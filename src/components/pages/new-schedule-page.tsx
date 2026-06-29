import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
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
	MAX_NOTES_LEN,
	validateNotesOptional,
	validatePositiveInteger,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FormField } from "../form";

interface Tour {
	_id: string;
	name: string;
}

interface FormValues extends Record<string, unknown> {
	tourId: string;
	date: string;
	startTime: string;
	endTime: string;
	capacityTotal: string;
	notes: string;
}

const INITIAL: FormValues = {
	tourId: "",
	date: "",
	startTime: "",
	endTime: "",
	capacityTotal: "10",
	notes: "",
};

export function NewSchedulePage() {
	const create = useMutation(api.tourSchedules.create);
	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const [capErr, setCapErr] = useState<string | null>(null);
	const [notesErr, setNotesErr] = useState<string | null>(null);

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			if (!v.tourId) throw new Error("Please select a tour");
			if (!v.date || !v.startTime || !v.endTime) {
				throw new Error("Date and times are required");
			}
			if (v.startTime >= v.endTime) {
				throw new Error("End time must be after start time");
			}
			const capError = validatePositiveInteger(v.capacityTotal, "Capacity");
			setCapErr(capError);
			const notesError = validateNotesOptional(v.notes);
			setNotesErr(notesError);
			if (capError || notesError) {
				throw new Error(capError ?? notesError ?? "Invalid input");
			}
			const id = await create({
				tourId: v.tourId as Id<"tours">,
				date: v.date,
				startTime: v.startTime,
				endTime: v.endTime,
				capacityTotal: Number(v.capacityTotal),
				notes: v.notes.trim() || undefined,
			});
			return id;
		},
		initialValues: INITIAL,
		redirectTo: (id) => `/dashboard/schedules/${id}`,
		successMessage: "Schedule created",
	});

	return (
		<EntityFormPage
			form={form}
			title="New tour schedule"
			description="Schedule a concrete tour instance"
			backTo="/dashboard/schedules"
			submitLabel="Create schedule"
		>
			<FormField label="Tour *" htmlFor="tour">
				<Select
					value={form.values.tourId}
					onValueChange={(v) => form.set("tourId", v)}
				>
					<SelectTrigger id="tour">
						<SelectValue placeholder="Select a tour…" />
					</SelectTrigger>
					<SelectContent>
						{(tours as Tour[] | undefined)?.map((t) => (
							<SelectItem key={t._id} value={t._id}>
								{t.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</FormField>

			<FormField label="Date *" htmlFor="date">
				<Input
					id="date"
					type="date"
					required
					value={form.values.date}
					onChange={(e) => form.set("date", e.target.value)}
				/>
			</FormField>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Start time *" htmlFor="start">
					<Input
						id="start"
						type="time"
						required
						value={form.values.startTime}
						onChange={(e) => form.set("startTime", e.target.value)}
					/>
				</FormField>
				<FormField label="End time *" htmlFor="end">
					<Input
						id="end"
						type="time"
						required
						value={form.values.endTime}
						onChange={(e) => form.set("endTime", e.target.value)}
					/>
				</FormField>
			</div>

			<FormField label="Capacity *" htmlFor="cap" error={capErr ?? undefined}>
				<Input
					id="cap"
					type="number"
					min="1"
					required
					value={form.values.capacityTotal}
					onChange={(e) => {
						form.set("capacityTotal", e.target.value);
						if (capErr) setCapErr(null);
					}}
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
