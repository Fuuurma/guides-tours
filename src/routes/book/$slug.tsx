import { convexQuery } from "@convex-dev/react-query";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { MapPin, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { BookingHero } from "@/components/booking-hero";
import {
	BookingConfirmationCard,
	BookingRequestForm,
} from "@/components/pages/booking-sections";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
	publicBookingDefaults,
	publicBookingSchema,
} from "@/lib/public-booking-form";
import { submitPublicBooking } from "@/lib/public-booking-submit";
import { getSafeDisplayMessage } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/book/$slug")({
	component: PublicBookingPage,
});

function PublicBookingPage() {
	const { slug } = Route.useParams();
	const { data, isPending, error } = useQuery(
		convexQuery(api.public_booking.getOrgAndToursBySlug, { slug }),
	);
	// F371: the public surface speaks slug, never the internal tenant key.
	const [blackoutCheck, setBlackoutCheck] = useState<{
		tourId: Id<"tours">;
		date: string;
	} | null>(null);
	const { data: isBlackedOut } = useQuery(
		convexQuery(
			api.tourBlackoutDates.publicIsBlackout,
			blackoutCheck
				? {
						slug,
						tourId: blackoutCheck.tourId,
						date: blackoutCheck.date,
					}
				: "skip",
		),
	);

	const [confirmation, setConfirmation] = useState<{
		bookingId: string;
		status: string;
		canPay: boolean;
		balanceDueCents: string;
		email: string;
		emailConsent: boolean;
		stripePublishableKey?: string;
	} | null>(null);
	const [submitErr, setSubmitErr] = useState<string | null>(null);
	const createPublicCheckout = useAction(
		api.payments_stripe_actions.createPublicHostedCheckout,
	);
	const createPublicPaymentIntent = useAction(
		api.payments_stripe_actions.createPublicPaymentIntent,
	);

	const form = useForm({
		defaultValues: publicBookingDefaults,
		validators: { onSubmit: publicBookingSchema },
		onSubmit: async ({ value }) => {
			await submitPublicBooking(value, {
				form,
				slug,
				isBlackedOut,
				availableSlots,
				slotsLoading,
				slotsLoaded,
				hasPublishedSlots,
				setConfirmation,
				setSubmitErr,
			});
		},
	});

	const tourId = useStore(form.store, (s) => s.values.tourId);
	const date = useStore(form.store, (s) => s.values.date);
	const scheduleId = useStore(form.store, (s) => s.values.scheduleId);
	const emailConsent = useStore(form.store, (s) => s.values.emailConsent);

	const slotReady = Boolean(tourId && date);
	const {
		data: availableSlots,
		isFetching: slotsFetching,
		isPending: slotsPending,
	} = useQuery(
		convexQuery(
			api.public_booking.listAvailableSlots,
			slotReady
				? {
						slug,
						tourId: tourId as Id<"tours">,
						date,
					}
				: "skip",
		),
	);
	const slotsLoaded =
		slotReady &&
		availableSlots !== undefined &&
		!slotsFetching &&
		!slotsPending;
	const hasPublishedSlots = slotsLoaded && (availableSlots?.length ?? 0) > 0;
	const slotsLoading = slotReady && !slotsLoaded;

	useEffect(() => {
		if (typeof window === "undefined") return;
		const params = new URLSearchParams(window.location.search);
		if (params.get("paid") === "1") {
			toast.success(
				"Thanks — payment received. Your balance will update shortly.",
			);
		} else if (params.get("pay_cancelled") === "1") {
			toast.message(
				"Payment cancelled — you can pay later from your confirmation email.",
			);
		} else {
			return;
		}
		params.delete("paid");
		params.delete("pay_cancelled");
		const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
		window.history.replaceState({}, "", next);
	}, []);

	useEffect(() => {
		if (tourId && date) {
			setBlackoutCheck({
				tourId: tourId as Id<"tours">,
				date,
			});
		} else {
			setBlackoutCheck(null);
		}
	}, [tourId, date]);

	if (isPending) {
		return (
			<PublicBookingFrame>
				<div
					role="status"
					aria-label="Loading booking page"
					className="flex flex-col gap-4"
				>
					<Skeleton className="h-44 w-full rounded-2xl sm:h-56" />
					<Skeleton className="h-4 w-28" />
					<Skeleton className="h-9 w-2/3" />
					<Skeleton className="h-5 w-full max-w-xl" />
					<Skeleton className="h-24 w-full rounded-xl" />
					<Skeleton className="h-64 w-full" />
				</div>
			</PublicBookingFrame>
		);
	}

	if (error) {
		return (
			<PublicBookingFrame>
				<h1 className="mb-6 font-display text-3xl font-normal tracking-tight">
					Book a tour
				</h1>
				<Empty className="border">
					<EmptyHeader>
						<EmptyTitle>Could not load this page</EmptyTitle>
						<EmptyDescription>{getSafeDisplayMessage(error)}</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button
							type="button"
							variant="outline"
							onClick={() => window.location.reload()}
						>
							<RotateCcw data-icon="inline-start" /> Try again
						</Button>
					</EmptyContent>
				</Empty>
			</PublicBookingFrame>
		);
	}

	if (!data) {
		return (
			<PublicBookingFrame>
				<h1 className="mb-6 font-display text-3xl font-normal tracking-tight">
					Book a tour
				</h1>
				<Empty className="border">
					<EmptyHeader>
						<EmptyTitle>Booking page not found</EmptyTitle>
						<EmptyDescription>
							The link you followed is invalid. Check the URL or contact the
							tour operator.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</PublicBookingFrame>
		);
	}

	const selectedTour = data.tours.find((t) => t._id === tourId);

	if (confirmation) {
		return (
			<PublicBookingFrame orgName={data.organizationName}>
				<BookingConfirmationCard
					confirmation={confirmation}
					organizationName={data.organizationName}
					slug={slug}
					createPaymentIntent={createPublicPaymentIntent}
					createCheckout={createPublicCheckout}
					onBookAnother={() => {
						setConfirmation(null);
						setSubmitErr(null);
						setBlackoutCheck(null);
						form.reset();
					}}
				/>
			</PublicBookingFrame>
		);
	}

	return (
		<PublicBookingFrame orgName={data.organizationName}>
			<BookingHero
				organizationName={data.organizationName}
				slug={slug}
				tours={data.tours}
			/>

			{data.tours.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<MapPin />
						</EmptyMedia>
						<EmptyTitle>No tours available</EmptyTitle>
						<EmptyDescription>
							This operator hasn&apos;t published any tours yet. Check back
							later.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<BookingRequestForm
					form={form}
					tours={data.tours}
					availableSlots={availableSlots}
					slotsLoading={slotsLoading}
					slotsLoaded={slotsLoaded}
					hasPublishedSlots={hasPublishedSlots}
					isBlackedOut={isBlackedOut}
					slotReady={slotReady}
					selectedTour={selectedTour}
					scheduleId={scheduleId}
					emailConsent={emailConsent}
					submitErr={submitErr}
				/>
			)}
		</PublicBookingFrame>
	);
}
function PublicBookingFrame({
	orgName,
	children,
}: {
	orgName?: string;
	children: ReactNode;
}) {
	return (
		<main className="min-h-screen bg-background font-landing text-foreground antialiased">
			<header className="border-b">
				<div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-4 sm:px-6">
					<Link
						to="/"
						className="flex items-center gap-2.5"
						aria-label="guides.tours home"
					>
						<span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
							<MapPin className="size-4" strokeWidth={2.5} />
						</span>
						<span className="text-sm font-semibold tracking-tight">
							guides<span className="text-chart-1">.</span>tours
						</span>
					</Link>
					{orgName ? (
						<p className="truncate text-sm text-muted-foreground">{orgName}</p>
					) : (
						<Link
							to="/"
							className="text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							Back to home
						</Link>
					)}
				</div>
			</header>
			<div className="mx-auto max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
				{children}
			</div>
		</main>
	);
}
