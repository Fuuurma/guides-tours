import { createFileRoute } from "@tanstack/react-router";
import { NewBookingPage } from "../../../components/pages/new-booking-page";

export const Route = createFileRoute("/dashboard/bookings/new")({
	validateSearch: (
		search: Record<string, unknown>,
	): { scheduleId?: string } => {
		const scheduleId =
			typeof search.scheduleId === "string" ? search.scheduleId : undefined;
		return scheduleId ? { scheduleId } : {};
	},
	component: NewBookingPage,
});
