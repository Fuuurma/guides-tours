import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "../form";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { MAX_NOTES_LEN, validateNotesOptional } from "@/lib/validation";

interface FormValues extends Record<string, unknown> {
	startDate: string;
	endDate: string;
	reason: string;
}

const INITIAL: FormValues = {
	startDate: "",
	endDate: "",
	reason: "",
};

export function NewVacationPage() {
	const create = useMutation(api.vacationRequests.create);
	const [dateErr, setDateErr] = useState<string | null>(null);
	const [reasonErr, setReasonErr] = useState<string | null>(null);

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			let dateError: string | null = null;
			if (!v.startDate || !v.endDate) {
				dateError = "Start and end dates are required";
			} else if (Date.parse(v.endDate) < Date.parse(v.startDate)) {
				dateError = "End date cannot be before start date";
			}
			setDateErr(dateError);
			const reasonError = validateNotesOptional(v.reason);
			setReasonErr(reasonError);
			if (dateError || reasonError) {
				throw new Error(dateError ?? reasonError ?? "Invalid input");
			}
			const id = await create({
				startDate: v.startDate,
				endDate: v.endDate,
				reason: v.reason.trim() || undefined,
			});
			return id;
		},
		initialValues: INITIAL,
		redirectTo: (id) => `/dashboard/vacations/${id}`,
		successMessage: "Vacation request submitted",
	});

	return (
		<EntityFormPage
			form={form}
			title="New vacation request"
			description="Request time off — pending review by an admin"
			backTo="/dashboard/vacations"
			submitLabel="Submit request"
		>
			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Start date *" htmlFor="start">
					<Input id="start" type="date" required value={form.values.startDate} onChange={(e) => { form.set("startDate", e.target.value); if (dateErr) setDateErr(null); }} />
				</FormField>
				<FormField label="End date *" htmlFor="end" error={dateErr ?? undefined}>
					<Input id="end" type="date" required value={form.values.endDate} onChange={(e) => { form.set("endDate", e.target.value); if (dateErr) setDateErr(null); }} />
				</FormField>
			</div>

			<FormField label="Reason" htmlFor="reason" error={reasonErr ?? undefined}>
				<Textarea
					id="reason"
					value={form.values.reason}
					onChange={(e) => {
						form.set("reason", e.target.value);
						if (reasonErr) setReasonErr(null);
					}}
					rows={3}
					maxLength={MAX_NOTES_LEN}
					placeholder="Optional — short note for the reviewer"
				/>
			</FormField>
		</EntityFormPage>
	);
}
