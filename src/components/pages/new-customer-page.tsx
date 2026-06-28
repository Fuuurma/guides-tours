import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "../form";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import {
	MAX_NAME_LEN,
	MAX_NOTES_LEN,
	validateEmail,
	validateName,
	validateNotesOptional,
	validatePhoneOptional,
} from "@/lib/validation";

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
	const [nameErr, setNameErr] = useState<string | null>(null);
	const [emailErr, setEmailErr] = useState<string | null>(null);
	const [phoneErr, setPhoneErr] = useState<string | null>(null);
	const [notesErr, setNotesErr] = useState<string | null>(null);

	const form = useEntityForm<FormValues, string>({
		mutation: async (values) => {
			const nameError = validateName(values.name);
			const emailError = validateEmail(values.email);
			const phoneError = validatePhoneOptional(values.phone);
			const notesError = validateNotesOptional(values.notes);
			setNameErr(nameError);
			setEmailErr(emailError);
			setPhoneErr(phoneError);
			setNotesErr(notesError);
			if (nameError || emailError || phoneError || notesError) {
				throw new Error(nameError ?? emailError ?? phoneError ?? notesError ?? "Invalid input");
			}
			const id = await create({
				name: values.name.trim(),
				email: values.email.trim().toLowerCase(),
				phone: values.phone.trim() || undefined,
				preferredLanguage: values.preferredLanguage.trim() || "en",
				notes: values.notes.trim() || undefined,
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
			<FormField label="Name *" htmlFor="name" error={nameErr ?? undefined}>
				<Input
					id="name"
					required
					maxLength={MAX_NAME_LEN}
					value={form.values.name}
					onChange={(e) => {
						form.set("name", e.target.value);
						if (nameErr) setNameErr(null);
					}}
					placeholder="Jane Doe"
				/>
			</FormField>

			<FormField label="Email *" htmlFor="email" error={emailErr ?? undefined}>
				<Input
					id="email"
					type="email"
					required
					maxLength={254}
					value={form.values.email}
					onChange={(e) => {
						form.set("email", e.target.value);
						if (emailErr) setEmailErr(null);
					}}
					placeholder="jane@example.com"
				/>
			</FormField>

			<FormField label="Phone" htmlFor="phone" error={phoneErr ?? undefined}>
				<Input
					id="phone"
					type="tel"
					maxLength={30}
					value={form.values.phone}
					onChange={(e) => {
						form.set("phone", e.target.value);
						if (phoneErr) setPhoneErr(null);
					}}
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
				<p className="text-muted-foreground text-xs text-right">
					{form.values.notes.length} / {MAX_NOTES_LEN}
				</p>
			</FormField>
		</EntityFormPage>
	);
}
