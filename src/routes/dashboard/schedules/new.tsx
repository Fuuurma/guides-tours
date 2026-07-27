import { createFileRoute } from "@tanstack/react-router";
import { NewSchedulePage } from "../../../components/pages/new-schedule-page";

function NewScheduleRoute() {
	const { tourId } = Route.useSearch();
	return <NewSchedulePage preselectedTourId={tourId} />;
}

export const Route = createFileRoute("/dashboard/schedules/new")({
	validateSearch: (search: Record<string, unknown>): { tourId?: string } => {
		const tourId =
			typeof search.tourId === "string" ? search.tourId : undefined;
		return tourId ? { tourId } : {};
	},
	component: NewScheduleRoute,
});
