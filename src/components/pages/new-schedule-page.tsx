import { StaffDepartureForm } from "./staff-departure-form";

export function NewSchedulePage({
	preselectedTourId,
	searchDate,
}: {
	preselectedTourId?: string;
	searchDate?: string;
}) {
	return (
		<StaffDepartureForm
			intent="publish"
			preselectedTourId={preselectedTourId}
			searchDate={searchDate}
		/>
	);
}
