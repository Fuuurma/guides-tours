import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import type { Id } from "../../../convex/_generated/dataModel";
import { FormField } from "../form";

interface FormValues extends Record<string, unknown> {
	name: string;
	email: string;
	phone: string;
	preferredLanguage: string;
	notes: string;
	vipStatus: boolean;
}

interface EditCustomerPageProps {
	customerId: string;
}

export function EditCustomerPage({ customerId }: EditCustomerPageProps) {
	const customer = useQuery(api.customers.get, {
		customerId: customerId as Id<"customers">,
	});
	const update = useMutation(api.customers.update);
	const [loaded, setLoaded] = useState(false);
	const [nameErr, setNameErr] = useState<string | null>(null);
	const [emailErr, setEmailErr] = useState<string | null>(null);
	const [phoneErr, setPhoneErr] = useState<string | null>(null);
	const [notesErr, setNotesErr] = useState<string | null>(null);

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const nameError = validateName(v.name);
			const emailError = validateEmail(v.email);
			const phoneError = validatePhoneOptional(v.phone);
			const notesError = validateNotesOptional(v.notes);
			setNameErr(nameError);
			setEmailErr(emailError);
			setPhoneErr(phoneError);
			setNotesErr(notesError);
			if (nameError || emailError || phoneError || notesError) {
				throw new Error(
					nameError ??
						emailError ??
						phoneError ??
						notesError ??
						"Invalid input",
				);
			}
			await update({
				customerId: customerId as Id<"customers">,
				name: v.name.trim(),
				email: v.email.trim(),
				phone: v.phone.trim() || undefined,
				preferredLanguage: v.preferredLanguage.trim() || "en",
				notes: v.notes.trim() || undefined,
				vipStatus: v.vipStatus,
			});
			return customerId;
		},
		initialValues: {
			name: "",
			email: "",
			phone: "",
			preferredLanguage: "en",
			notes: "",
			vipStatus: false,
		},
		redirectTo: (id) => `/dashboard/customers/${id}`,
		successMessage: "Customer updated",
	});

	useEffect(() => {
		if (customer && !loaded) {
			const c = customer as unknown as {
				name: string;
				email: string;
				phone: string;
				preferredLanguage: string;
				notes: string;
				vipStatus: boolean;
			};
			form.set("name", c.name);
			form.set("email", c.email);
			form.set("phone", c.phone ?? "");
			form.set("preferredLanguage", c.preferredLanguage ?? "en");
			form.set("notes", c.notes ?? "");
			form.set("vipStatus", !!c.vipStatus);
			setLoaded(true);
		}
	}, [customer, loaded, form]);

	if (customer === undefined) {
		return (
			<div className="space-y-4 p-4">
				<Skeleton className="h-8 w-1/3" />
				<Skeleton className="h-4 w-1/2" />
				<Skeleton className="h-32 w-full" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-2/3" />
			</div>
		);
	}
	if (customer === null) {
		return (
			<div className="space-y-4">
				<p className="text-muted-foreground">Customer not found.</p>
			</div>
		);
	}

	return (
		<EntityFormPage
			form={form}
			title="Edit customer"
			description="Update customer profile"
			backTo={`/dashboard/customers/${customerId}`}
			submitLabel="Save changes"
		>
			<FormField
				label="Name *"
				htmlFor="edit-customer-name"
				error={nameErr ?? undefined}
			>
				<Input
					id="edit-customer-name"
					required
					maxLength={MAX_NAME_LEN}
					value={form.values.name}
					onChange={(e) => {
						form.set("name", e.target.value);
						if (nameErr) setNameErr(null);
					}}
				/>
			</FormField>

			<FormField
				label="Email *"
				htmlFor="edit-customer-email"
				error={emailErr ?? undefined}
			>
				<Input
					id="edit-customer-email"
					type="email"
					required
					maxLength={254}
					value={form.values.email}
					onChange={(e) => {
						form.set("email", e.target.value);
						if (emailErr) setEmailErr(null);
					}}
				/>
			</FormField>

			<FormField
				label="Phone"
				htmlFor="edit-customer-phone"
				error={phoneErr ?? undefined}
			>
				<Input
					id="edit-customer-phone"
					type="tel"
					maxLength={30}
					value={form.values.phone}
					onChange={(e) => {
						form.set("phone", e.target.value);
						if (phoneErr) setPhoneErr(null);
					}}
				/>
			</FormField>

			<FormField label="Preferred language" htmlFor="edit-customer-lang">
				<Input
					id="edit-customer-lang"
					maxLength={10}
					value={form.values.preferredLanguage}
					onChange={(e) => form.set("preferredLanguage", e.target.value)}
				/>
			</FormField>

			<FormField
				label="Notes"
				htmlFor="edit-customer-notes"
				error={notesErr ?? undefined}
			>
				<Textarea
					id="edit-customer-notes"
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

			<label
				htmlFor="edit-customer-vip"
				className="flex items-center gap-2 text-sm"
			>
				<Checkbox
					id="edit-customer-vip"
					checked={form.values.vipStatus}
					onCheckedChange={(checked) => form.set("vipStatus", checked === true)}
				/>
				VIP customer
			</label>
		</EntityFormPage>
	);
}

// Route declaration lives in
// src/routes/dashboard/customers/$customerId/edit.tsx to keep page
// components decoupled from TanStack Router wiring.
