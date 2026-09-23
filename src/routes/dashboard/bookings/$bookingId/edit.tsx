import { createFileRoute } from "@tanstack/react-router";
import { EditBookingPage } from "../../../../components/pages/edit-booking-page";

function Edit$bookingidRoute() {
	const { bookingId } = Route.useParams();
	return <EditBookingPage bookingId={ bookingId } />;
}

export const Route = createFileRoute("/dashboard/bookings/$bookingId/edit")({
	component: Edit$bookingidRoute,
});
