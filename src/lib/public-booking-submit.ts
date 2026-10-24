import { toast } from "sonner";
import type {
	BookingConfirmation,
	BookingFormApi,
} from "@/components/pages/booking-sections";
import { getSafeDisplayMessage } from "@/lib/utils";

export type PublicBookingSubmitDeps = {
	form: BookingFormApi;
	slug: string;
	isBlackedOut: boolean | undefined;
	availableSlots:
		| Array<{
				_id: string;
				startTime: string;
				endTime?: string;
				seatsLeft: number;
		  }>
		| undefined;
	slotsLoading: boolean;
	slotsLoaded: boolean;
	hasPublishedSlots: boolean;
	setConfirmation: (c: BookingConfirmation | null) => void;
	setSubmitErr: (message: string | null) => void;
};

/**
 * The public booking submit path: slot/blackout-aware validation, the
 * booking POST, and the confirmation hand-off. A pure module function so
 * the page component stays under the giant-component line; the page calls
 * it from useForm's onSubmit with its live query state.
 */
export async function submitPublicBooking(
	value: BookingFormApi["state"]["values"],
	deps: PublicBookingSubmitDeps,
) {
	const {
		form,
		slug,
		isBlackedOut,
		availableSlots,
		slotsLoading,
		slotsLoaded,
		hasPublishedSlots,
		setConfirmation,
		setSubmitErr,
	} = deps;
	setSubmitErr(null);

	if (value.date && isBlackedOut) {
		form.setFieldMeta("date", (prev) => ({
			...prev,
			errorMap: {
				...prev.errorMap,
				onSubmit: "This date is not available",
			},
		}));
		toast.error("Please fix the highlighted fields");
		return;
	}

	const guestCount = Number(value.guests);
	const selectedSlot = availableSlots?.find((s) => s._id === value.scheduleId);

	if (slotsLoading) {
		form.setFieldMeta("startTime", (prev) => ({
			...prev,
			errorMap: { ...prev.errorMap, onSubmit: "Loading available times…" },
		}));
		toast.error("Please fix the highlighted fields");
		return;
	}
	if (hasPublishedSlots && !value.scheduleId) {
		form.setFieldMeta("startTime", (prev) => ({
			...prev,
			errorMap: {
				...prev.errorMap,
				onSubmit: "Please select an available time",
			},
		}));
		toast.error("Please fix the highlighted fields");
		return;
	}
	if (slotsLoaded && !hasPublishedSlots && !value.startTime) {
		form.setFieldMeta("startTime", (prev) => ({
			...prev,
			errorMap: { ...prev.errorMap, onSubmit: "Start time is required" },
		}));
		toast.error("Please fix the highlighted fields");
		return;
	}
	if (selectedSlot && guestCount > selectedSlot.seatsLeft) {
		form.setFieldMeta("guests", (prev) => ({
			...prev,
			errorMap: {
				...prev.errorMap,
				onSubmit: `Only ${selectedSlot.seatsLeft} seats left for this time`,
			},
		}));
		toast.error("Please fix the highlighted fields");
		return;
	}

	try {
		const convexSiteUrl =
			(import.meta.env.VITE_CONVEX_SITE_URL as string | undefined)?.replace(
				/\/$/,
				"",
			) || window.location.origin;
		const res = await fetch(
			`${convexSiteUrl}/api/public/book/${encodeURIComponent(slug)}`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					tourId: value.tourId,
					customerName: value.name.trim(),
					customerEmail: value.email.trim(),
					customerPhone: value.phone.trim() || undefined,
					date: value.date,
					startTime: selectedSlot?.startTime ?? value.startTime,
					scheduleId: value.scheduleId || undefined,
					guests: guestCount,
					notes: value.notes.trim() || undefined,
					emailConsent: value.emailConsent,
					smsConsent: value.smsConsent,
				}),
			},
		);
		const body = (await res.json()) as
			| {
					bookingId: string;
					status: string;
					canPay?: boolean;
					balanceDueCents?: string;
					stripePublishableKey?: string;
			  }
			| { error: string };
		if (!res.ok) {
			const msg = ("error" in body && body.error) || "Booking failed";
			setSubmitErr(msg);
			toast.error(msg);
			return;
		}
		if ("bookingId" in body) {
			setConfirmation({
				bookingId: body.bookingId,
				status: body.status,
				canPay: Boolean(body.canPay),
				balanceDueCents: body.balanceDueCents ?? "0",
				email: value.email.trim(),
				emailConsent: value.emailConsent,
				stripePublishableKey: body.stripePublishableKey,
			});
			toast.success("Booking request received");
		}
	} catch (err) {
		const msg = getSafeDisplayMessage(err);
		setSubmitErr(msg);
		toast.error(msg);
	}
}
