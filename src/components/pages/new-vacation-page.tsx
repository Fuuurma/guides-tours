import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "../form";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";

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
			if (!v.startDate || !v.endDate) throw new Error("Start and end dates are required");
			if (Date.parse(v.endDate) < Date.parse(v.startDate))
				throw new Error("End date cannot be before start date");
			const id = await create({
				startDate: v.startDate,
				endDate: v.endDate,
				reason: v.reason || undefined,
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
					<Input id="start" type="date" required value={form.values.startDate} onChange={(e) => form.set("startDate", e.target.value)} />
				</FormField>
				<FormField label="End date *" htmlFor="end">
					<Input id="end" type="date" required value={form.values.endDate} onChange={(e) => form.set("endDate", e.target.value)} />
				</FormField>
			</div>

			<FormField label="Reason" htmlFor="reason">
				<Textarea id="reason" value={form.values.reason} onChange={(e) => form.set("reason", e.target.value)} rows={3} placeholder="Optional — short note for the reviewer" />
			</FormField>
		</EntityFormPage>
	);
}
