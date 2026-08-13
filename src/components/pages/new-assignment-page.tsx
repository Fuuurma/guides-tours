import { getRouteApi } from "@tanstack/react-router";
import { StaffDepartureForm } from "./staff-departure-form";

const assignmentNewRoute = getRouteApi("/dashboard/assignments/new");

export function NewAssignmentPage() {
	const { date, scheduleId, tourId } = assignmentNewRoute.useSearch();
	return (
		<StaffDepartureForm
			intent="assign"
			preselectedTourId={tourId}
			searchDate={date}
			searchScheduleId={scheduleId}
		/>
	);
}
