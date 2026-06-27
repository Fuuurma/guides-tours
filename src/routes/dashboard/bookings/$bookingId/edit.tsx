import { createFileRoute } from "@tanstack/react-router";
import { EditBookingPage } from "../../../../components/pages/edit-booking-page";

export const Route = createFileRoute("/dashboard/bookings/$bookingId/edit")({
	component: () => {
		const { bookingId } = Route.useParams();
		return <EditBookingPage bookingId={bookingId} />;
	},
});
