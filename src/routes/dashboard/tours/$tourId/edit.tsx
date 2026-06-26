import { createFileRoute } from "@tanstack/react-router";
import { EditTourPage } from "../../../../components/pages/edit-tour-page";

export const Route = createFileRoute("/dashboard/tours/$tourId/edit")({
	component: EditTourPage,
});