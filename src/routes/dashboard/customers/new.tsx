import { createFileRoute } from "@tanstack/react-router";
import { NewCustomerPage } from "../../../components/pages/new-customer-page";

export const Route = createFileRoute("/dashboard/customers/new")({
	component: NewCustomerPage,
});