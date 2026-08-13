import { createFileRoute } from "@tanstack/react-router";
import { NewBookingPage } from "../../../components/pages/new-booking-page";

export const Route = createFileRoute("/dashboard/bookings/new")({
	validateSearch: (
		search: Record<string, unknown>,
	): { scheduleId?: string; customerId?: string } => {
		const scheduleId =
			typeof search.scheduleId === "string" ? search.scheduleId : undefined;
		const customerId =
			typeof search.customerId === "string" ? search.customerId : undefined;
		return {
			...(scheduleId ? { scheduleId } : {}),
			...(customerId ? { customerId } : {}),
		};
	},
	component: NewBookingPage,
});
