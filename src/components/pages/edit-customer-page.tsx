import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { FormField } from "../form";
import { api } from "../../../convex/_generated/api";

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
	const customer = useQuery(api.customers.get, { customerId: customerId as never });
	const update = useMutation(api.customers.update);
	const [loaded, setLoaded] = useState(false);

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			await update({
				customerId: customerId as never,
				name: v.name,
				email: v.email,
				phone: v.phone || undefined,
				preferredLanguage: v.preferredLanguage || "en",
				notes: v.notes || undefined,
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
		return <p className="text-muted-foreground">Loading…</p>;
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
			<FormField label="Name *" htmlFor="edit-customer-name">
				<Input
					id="edit-customer-name"
					required
					value={form.values.name}
					onChange={(e) => form.set("name", e.target.value)}
				/>
			</FormField>

			<FormField label="Email *" htmlFor="edit-customer-email">
				<Input
					id="edit-customer-email"
					type="email"
					required
					value={form.values.email}
					onChange={(e) => form.set("email", e.target.value)}
				/>
			</FormField>

			<FormField label="Phone" htmlFor="edit-customer-phone">
				<Input
					id="edit-customer-phone"
					type="tel"
					value={form.values.phone}
					onChange={(e) => form.set("phone", e.target.value)}
				/>
			</FormField>

			<FormField label="Preferred language" htmlFor="edit-customer-lang">
				<Input
					id="edit-customer-lang"
					value={form.values.preferredLanguage}
					onChange={(e) => form.set("preferredLanguage", e.target.value)}
				/>
			</FormField>

			<FormField label="Notes" htmlFor="edit-customer-notes">
				<Textarea
					id="edit-customer-notes"
					value={form.values.notes}
					onChange={(e) => form.set("notes", e.target.value)}
					rows={3}
					placeholder="Optional"
				/>
			</FormField>

			<label className="flex items-center gap-2 text-sm">
				<Checkbox
					id="edit-customer-vip"
					checked={form.values.vipStatus}
					onCheckedChange={(checked) =>
						form.set("vipStatus", checked === true)
					}
				/>
				VIP customer
			</label>
		</EntityFormPage>
	);
}

// Route declaration lives in
// src/routes/dashboard/customers/$customerId/edit.tsx to keep page
// components decoupled from TanStack Router wiring.
