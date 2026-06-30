import { useMutation } from "convex/react";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	MAX_NAME_LEN,
	MAX_NOTES_LEN,
	validateEmail,
	validateName,
	validateNotesOptional,
	validatePhoneOptional,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import { FormField } from "../form";

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
			return await create({
				name: values.name.trim(),
				email: values.email.trim().toLowerCase(),
				phone: values.phone.trim() || undefined,
				preferredLanguage: values.preferredLanguage.trim() || "en",
				notes: values.notes.trim() || undefined,
			});
		},
		validate: (values) => {
			const errs: Record<string, string> = {};
			const nameErr = validateName(values.name);
			if (nameErr) errs.name = nameErr;
			const emailErr = validateEmail(values.email);
			if (emailErr) errs.email = emailErr;
			const phoneErr = validatePhoneOptional(values.phone);
			if (phoneErr) errs.phone = phoneErr;
			const notesErr = validateNotesOptional(values.notes);
			if (notesErr) errs.notes = notesErr;
			return Object.keys(errs).length > 0 ? errs : null;
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
			<FormField label="Name *" htmlFor="name" error={form.fieldErrors.name}>
				<Input
					id="name"
					required
					maxLength={MAX_NAME_LEN}
					value={form.values.name}
					onChange={(e) => form.set("name", e.target.value)}
					placeholder="Jane Doe"
				/>
			</FormField>

			<FormField label="Email *" htmlFor="email" error={form.fieldErrors.email}>
				<Input
					id="email"
					type="email"
					required
					maxLength={254}
					value={form.values.email}
					onChange={(e) => form.set("email", e.target.value)}
					placeholder="jane@example.com"
				/>
			</FormField>

			<FormField label="Phone" htmlFor="phone" error={form.fieldErrors.phone}>
				<Input
					id="phone"
					type="tel"
					maxLength={30}
					value={form.values.phone}
					onChange={(e) => form.set("phone", e.target.value)}
					placeholder="+1 555 555 5555"
				/>
			</FormField>

			<FormField label="Preferred language" htmlFor="lang">
				<Input
					id="lang"
					maxLength={10}
					value={form.values.preferredLanguage}
					onChange={(e) => form.set("preferredLanguage", e.target.value)}
					placeholder="en"
				/>
			</FormField>

			<FormField label="Notes" htmlFor="notes" error={form.fieldErrors.notes}>
				<Textarea
					id="notes"
					value={form.values.notes}
					onChange={(e) => form.set("notes", e.target.value)}
					rows={3}
					maxLength={MAX_NOTES_LEN}
					placeholder="Optional"
				/>
				<p className="text-muted-foreground text-xs text-right">
					{form.values.notes.length} / {MAX_NOTES_LEN}
				</p>
			</FormField>
		</EntityFormPage>
	);
}
