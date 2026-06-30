import { useMutation } from "convex/react";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_NOTES_LEN, validateNotesOptional } from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import { FormField } from "../form";

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

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const id = await create({
				startDate: v.startDate,
				endDate: v.endDate,
				reason: v.reason.trim() || undefined,
			});
			return id;
		},
		validate: (v) => {
			const errs: Record<string, string> = {};
			if (!v.startDate || !v.endDate) {
				errs.endDate = "Start and end dates are required";
			} else if (Date.parse(v.endDate) < Date.parse(v.startDate)) {
				errs.endDate = "End date cannot be before start date";
			}
			const reasonErr = validateNotesOptional(v.reason);
			if (reasonErr) errs.reason = reasonErr;
			return Object.keys(errs).length > 0 ? errs : null;
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
					<Input
						id="start"
						type="date"
						required
						value={form.values.startDate}
						onChange={(e) => form.set("startDate", e.target.value)}
					/>
				</FormField>
				<FormField
					label="End date *"
					htmlFor="end"
					error={form.fieldErrors.endDate}
				>
					<Input
						id="end"
						type="date"
						required
						value={form.values.endDate}
						onChange={(e) => form.set("endDate", e.target.value)}
					/>
				</FormField>
			</div>

			<FormField
				label="Reason"
				htmlFor="reason"
				error={form.fieldErrors.reason}
			>
				<Textarea
					id="reason"
					value={form.values.reason}
					onChange={(e) => form.set("reason", e.target.value)}
					rows={3}
					maxLength={MAX_NOTES_LEN}
					placeholder="Optional — short note for the reviewer"
				/>
			</FormField>
		</EntityFormPage>
	);
}
