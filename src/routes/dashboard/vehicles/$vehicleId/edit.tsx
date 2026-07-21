import { createFileRoute } from "@tanstack/react-router";
import { EditVehiclePage } from "../../../../components/pages/edit-vehicle-page";

export const Route = createFileRoute("/dashboard/vehicles/$vehicleId/edit")({
	component: () => {
		const { vehicleId } = Route.useParams();
		return <EditVehiclePage vehicleId={vehicleId} />;
	},
});
