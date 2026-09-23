import { createFileRoute } from "@tanstack/react-router";
import { EditVehiclePage } from "../../../../components/pages/edit-vehicle-page";

function Edit$vehicleidRoute() {
	const { vehicleId } = Route.useParams();
	return <EditVehiclePage vehicleId={ vehicleId } />;
}

export const Route = createFileRoute("/dashboard/vehicles/$vehicleId/edit")({
	component: Edit$vehicleidRoute,
});
