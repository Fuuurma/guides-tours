import { createFileRoute } from "@tanstack/react-router";
import { NewSchedulePage } from "../../../components/pages/new-schedule-page";

function NewScheduleRoute() {
	const { tourId, date } = Route.useSearch();
	return <NewSchedulePage preselectedTourId={tourId} searchDate={date} />;
}

export const Route = createFileRoute("/dashboard/schedules/new")({
	validateSearch: (
		search: Record<string, unknown>,
	): { tourId?: string; date?: string } => {
		const out: { tourId?: string; date?: string } = {};
		const tourId =
			typeof search.tourId === "string" ? search.tourId : undefined;
		if (tourId) out.tourId = tourId;
		const date = typeof search.date === "string" ? search.date : undefined;
		if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) out.date = date;
		return out;
	},
	component: NewScheduleRoute,
});
