import { createFileRoute } from "@tanstack/react-router";
import { NewVehiclePage } from "../../../components/pages/new-vehicle-page";

export const Route = createFileRoute("/dashboard/vehicles/new")({
	component: NewVehiclePage,
});
