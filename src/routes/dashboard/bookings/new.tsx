import { createFileRoute } from "@tanstack/react-router";
import { NewBookingPage } from "../../../components/pages/new-booking-page";

export const Route = createFileRoute("/dashboard/bookings/new")({
	component: NewBookingPage,
});
