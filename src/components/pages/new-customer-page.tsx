import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { CustomerForm, EMPTY_CUSTOMER_FORM } from "./customer-form";

export function NewCustomerPage() {
	const navigate = useNavigate();
	const create = useMutation(api.customers.create);

	return (
		<CustomerForm
			mode="create"
			defaultValues={EMPTY_CUSTOMER_FORM}
			title="New customer"
			description="People you book onto departures — walk-ups, phone bookings, and repeats."
			backTo="/dashboard/customers"
			submitLabel="Create customer"
			onSave={async (value) => {
				const id = await create({
					name: value.name.trim(),
					email: value.email.trim().toLowerCase(),
					phone: value.phone.trim() || undefined,
					preferredLanguage: value.preferredLanguage.trim() || "en",
					notes: value.notes.trim() || undefined,
					emailConsent: value.emailConsent,
					smsConsent: value.smsConsent,
				});
				toast.success("Customer created");
				void navigate({
					to: "/dashboard/customers/$customerId",
					params: { customerId: id },
				});
			}}
		/>
	);
}
