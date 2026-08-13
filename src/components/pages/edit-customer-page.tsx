import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { DetailPage } from "@/components/detail-page";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CustomerForm, customerDocToFormValues } from "./customer-form";

interface EditCustomerPageProps {
	customerId: string;
}

export function EditCustomerPage({ customerId }: EditCustomerPageProps) {
	const navigate = useNavigate();
	const customer = useQuery(api.customers.get, {
		customerId: customerId as Id<"customers">,
	});
	const update = useMutation(api.customers.update);

	if (customer === undefined) {
		return <DetailSkeleton />;
	}
	if (customer === null) {
		return (
			<DetailPage title="Customer not found" backTo="/dashboard/customers" />
		);
	}

	return (
		<CustomerForm
			mode="edit"
			defaultValues={customerDocToFormValues(customer)}
			title={`Edit ${customer.name}`}
			description="Contact and consent used on walk-up bookings and reminders."
			backTo={`/dashboard/customers/${customerId}`}
			submitLabel="Save changes"
			idPrefix="edit-customer-"
			onSave={async (value) => {
				await update({
					customerId: customerId as Id<"customers">,
					name: value.name.trim(),
					email: value.email.trim(),
					phone: value.phone.trim() || undefined,
					preferredLanguage: value.preferredLanguage.trim() || "en",
					notes: value.notes.trim() || undefined,
					vipStatus: value.vipStatus,
					emailConsent: value.emailConsent,
					smsConsent: value.smsConsent,
				});
				toast.success("Customer updated");
				void navigate({
					to: "/dashboard/customers/$customerId",
					params: { customerId },
				});
			}}
		/>
	);
}

// Route declaration lives in
// src/routes/dashboard/customers/$customerId/edit.tsx to keep page
// components decoupled from TanStack Router wiring.
