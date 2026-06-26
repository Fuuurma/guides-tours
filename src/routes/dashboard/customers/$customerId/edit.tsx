import { createFileRoute } from "@tanstack/react-router";
import { EditCustomerPage } from "../../../../components/pages/edit-customer-page";

export const Route = createFileRoute("/dashboard/customers/$customerId/edit")({
	component: EditCustomerPage,
});