import { createFileRoute } from "@tanstack/react-router";
import { NewAssignmentPage } from "../../../components/pages/new-assignment-page";

export const Route = createFileRoute("/dashboard/assignments/new")({
	validateSearch: (
		search: Record<string, unknown>,
	): { date?: string; scheduleId?: string; tourId?: string } => {
		const out: { date?: string; scheduleId?: string; tourId?: string } = {};
		const date = typeof search.date === "string" ? search.date : undefined;
		if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) out.date = date;
		const scheduleId =
			typeof search.scheduleId === "string" ? search.scheduleId : undefined;
		if (scheduleId) out.scheduleId = scheduleId;
		const tourId =
			typeof search.tourId === "string" ? search.tourId : undefined;
		if (tourId) out.tourId = tourId;
		return out;
	},
	component: NewAssignmentPage,
});
