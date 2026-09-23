import { createFileRoute } from "@tanstack/react-router";
import { EditTourPage } from "../../../../components/pages/edit-tour-page";

function Edit$touridRoute() {
	const { tourId } = Route.useParams();
	return <EditTourPage tourId={tourId} />;
}

export const Route = createFileRoute("/dashboard/tours/$tourId/edit")({
	component: Edit$touridRoute,
});
