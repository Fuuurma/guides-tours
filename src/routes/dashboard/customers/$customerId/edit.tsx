import { createFileRoute } from "@tanstack/react-router";
import { EditCustomerPage } from "../../../../components/pages/edit-customer-page";

function Edit$customeridRoute() {
	const { customerId } = Route.useParams();
	return <EditCustomerPage customerId={customerId} />;
}

export const Route = createFileRoute("/dashboard/customers/$customerId/edit")({
	component: Edit$customeridRoute,
});
