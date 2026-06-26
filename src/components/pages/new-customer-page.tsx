import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "../form";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";

interface FormValues extends Record<string, unknown> {
	name: string;
	email: string;
	phone: string;
	preferredLanguage: string;
	notes: string;
}

const INITIAL: FormValues = {
	name: "",
	email: "",
	phone: "",
	preferredLanguage: "en",
	notes: "",
};

export function NewCustomerPage() {
	const create = useMutation(api.customers.create);
	const form = useEntityForm<FormValues, string>({
		mutation: async (values) => {
			const id = await create({
				name: values.name,
				email: values.email,
				phone: values.phone || undefined,
				preferredLanguage: values.preferredLanguage || "en",
				notes: values.notes || undefined,
			});
			return id;
		},
		initialValues: INITIAL,
		redirectTo: (id) => `/dashboard/customers/${id}`,
		successMessage: "Customer created",
	});

	return (
		<EntityFormPage
			form={form}
			title="New customer"
			description="Add a customer to your organization"
			backTo="/dashboard/customers"
			submitLabel="Create customer"
		>
			<FormField label="Name *" htmlFor="name">
				<Input
					id="name"
					required
					value={form.values.name}
					onChange={(e) => form.set("name", e.target.value)}
					placeholder="Jane Doe"
				/>
			</FormField>

			<FormField label="Email *" htmlFor="email">
				<Input
					id="email"
					type="email"
					required
					value={form.values.email}
					onChange={(e) => form.set("email", e.target.value)}
					placeholder="jane@example.com"
				/>
			</FormField>

			<FormField label="Phone" htmlFor="phone">
				<Input
					id="phone"
					type="tel"
					value={form.values.phone}
					onChange={(e) => form.set("phone", e.target.value)}
					placeholder="+1 555 555 5555"
				/>
			</FormField>

			<FormField label="Preferred language" htmlFor="lang">
				<Input
					id="lang"
					value={form.values.preferredLanguage}
					onChange={(e) => form.set("preferredLanguage", e.target.value)}
					placeholder="en"
				/>
			</FormField>

			<FormField label="Notes" htmlFor="notes">
				<Textarea
					id="notes"
					value={form.values.notes}
					onChange={(e) => form.set("notes", e.target.value)}
					rows={3}
					placeholder="Optional"
				/>
			</FormField>
		</EntityFormPage>
	);
}
