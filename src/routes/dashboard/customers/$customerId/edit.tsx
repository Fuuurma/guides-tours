import { createFileRoute } from "@tanstack/react-router";
import { EditCustomerPage } from "../../../../components/pages/edit-customer-page";

export const Route = createFileRoute("/dashboard/customers/$customerId/edit")({
	component: () => {
		const { customerId } = Route.useParams();
		return <EditCustomerPage customerId={customerId} />;
	},
});