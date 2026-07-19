import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatCentsCompact } from "@/lib/format";
import { getErrorMessage } from "@/lib/utils";
import {
	EMAIL_REGEX,
	MAX_EMAIL_LEN,
	MAX_NAME_LEN,
	MAX_NOTES_LEN,
	MAX_PHONE_LEN,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/book/$slug")({
	component: PublicBookingPage,
});

interface PublicTour {
	_id: string;
	name: string;
	description: string;
	durationHours: number;
	maxGuests: number;
	currency: string;
	basePriceCents: bigint | number | undefined;
}

function PublicBookingPage() {
	const { slug } = Route.useParams();
	const { data, isPending, error } = useQuery(
		convexQuery(api.public_booking.getOrgAndToursBySlug, { slug }),
	);
	// Server-side is the source of truth — the booking action rejects
	// blacked-out dates. This is a UX hint so the customer doesn't pick a
	// date that the operator has blocked, then get an error after submitting.
	const [date, setDate] = useState("");
	const [blackoutCheck, setBlackoutCheck] = useState<{
		tourId: Id<"tours">;
		date: string;
	} | null>(null);
	const { data: isBlackedOut } = useQuery(
		convexQuery(
			api.tourBlackoutDates.publicIsBlackout,
			blackoutCheck
				? { slug, tourId: blackoutCheck.tourId, date: blackoutCheck.date }
				: "skip",
		),
	);
	const [selectedTourId, setSelectedTourId] = useState<Id<"tours"> | "">("");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [startTime, setStartTime] = useState("");
	const [scheduleId, setScheduleId] = useState<Id<"tourSchedules"> | "">("");
	const [guests, setGuests] = useState("1");
	const [notes, setNotes] = useState("");
	const [emailConsent, setEmailConsent] = useState(true);
	const [smsConsent, setSmsConsent] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [confirmation, setConfirmation] = useState<{
		bookingId: string;
		canPay: boolean;
		balanceDueCents: string;
	} | null>(null);
	const [paying, setPaying] = useState(false);
	const createPublicCheckout = useAction(
		api.payments_stripe_actions.createPublicHostedCheckout,
	);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const params = new URLSearchParams(window.location.search);
		if (params.get("paid") === "1") {
			toast.success("Thanks — payment received. Your balance will update shortly.");
		} else if (params.get("pay_cancelled") === "1") {
			toast.message("Payment cancelled — you can pay later from your confirmation email.");
		} else {
			return;
		}
		params.delete("paid");
		params.delete("pay_cancelled");
		const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
		window.history.replaceState({}, "", next);
	}, []);

	// Inline field-level errors so users see what to fix next to the
	// input, not buried in a toast that vanishes after a few seconds.
	const [fieldErr, setFieldErr] = useState<{
		tour?: string;
		guests?: string;
		name?: string;
		email?: string;
		phone?: string;
		notes?: string;
		date?: string;
		startTime?: string;
	}>({});
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const slotReady = Boolean(selectedTourId && date);
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
						tourId: selectedTourId as Id<"tours">,
						date,
					}
				: "skip",
		),
	);
	const slotsLoaded =
		slotReady && availableSlots !== undefined && !slotsFetching && !slotsPending;
	const hasPublishedSlots = slotsLoaded && (availableSlots?.length ?? 0) > 0;
	const slotsLoading = slotReady && !slotsLoaded;

	if (isPending) {
		return (
			<main className="mx-auto max-w-2xl px-4 py-12">
				<div className="space-y-4">
					<Skeleton className="h-8 w-2/3" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-32 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			</main>
		);
	}

	if (error) {
		return (
			<main className="mx-auto max-w-2xl px-4 py-12">
				<Card>
					<CardHeader>
						<CardTitle>Error</CardTitle>
						<CardDescription>{error.message}</CardDescription>
					</CardHeader>
				</Card>
			</main>
		);
	}

	if (!data) {
		return (
			<main className="mx-auto max-w-2xl px-4 py-12">
				<Card>
					<CardHeader>
						<CardTitle>Booking page not found</CardTitle>
						<CardDescription>
							The link you followed is invalid. Please check the URL or contact
							the tour operator.
						</CardDescription>
					</CardHeader>
				</Card>
			</main>
		);
	}

	const selectedTour = data.tours.find((t) => t._id === selectedTourId);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitting(true);
		setFieldErr({});
		setSubmitErr(null);

		const guestCount = Number(guests);
		const errs: typeof fieldErr = {};
		if (!selectedTourId) errs.tour = "Please select a tour";
		if (!guestCount || guestCount <= 0)
			errs.guests = "Guests must be at least 1";
		if (!date) errs.date = "Please pick a date";
		// Client-side blackout guard — the backend also checks via
		// isBlackoutHelper, but block the submit here so the user sees
		// the error inline next to the date field instead of as a toast.
		if (date && isBlackedOut) {
			errs.date = "This date is not available";
		}
		if (slotsLoading) {
			errs.startTime = "Loading available times…";
		} else if (hasPublishedSlots && !scheduleId) {
			errs.startTime = "Please select an available time";
		} else if (slotsLoaded && !hasPublishedSlots && !startTime) {
			errs.startTime = "Start time is required";
		}
		const selectedSlot = availableSlots?.find((s) => s._id === scheduleId);
		if (selectedSlot && guestCount > selectedSlot.seatsLeft) {
			errs.guests = `Only ${selectedSlot.seatsLeft} seats left for this time`;
		}
		const nameTrimmed = name.trim();
		if (nameTrimmed.length < 2) errs.name = "Please enter your full name";
		else if (nameTrimmed.length > MAX_NAME_LEN)
			errs.name = `Name is too long (max ${MAX_NAME_LEN} characters)`;
		const emailTrimmed = email.trim();
		// Check length BEFORE shape — a 5000-char string would fail
		// the regex check, so the user would see "invalid email"
		// instead of the more accurate "too long" message.
		if (emailTrimmed.length > MAX_EMAIL_LEN) errs.email = "Email is too long";
		else if (!EMAIL_REGEX.test(emailTrimmed))
			errs.email = "Please enter a valid email address";
		if (phone && phone.length > 0) {
			const phoneDigits = phone.replace(/\D/g, "");
			if (phoneDigits.length < 6 || phoneDigits.length > 20) {
				errs.phone =
					"Please enter a valid phone number (6-20 digits) or leave it empty";
			}
		}
		if (notes.length > MAX_NOTES_LEN) {
			errs.notes = `Notes are too long (max ${MAX_NOTES_LEN} characters)`;
		}

		if (Object.keys(errs).length > 0) {
			setFieldErr(errs);
			toast.error("Please fix the highlighted fields");
			setSubmitting(false);
			return;
		}

		try {
			const res = await fetch(`/api/public/book/${slug}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					tourId: selectedTourId,
					customerName: nameTrimmed,
					customerEmail: emailTrimmed,
					customerPhone: phone.trim() || undefined,
					date,
					startTime: selectedSlot?.startTime ?? startTime,
					scheduleId: scheduleId || undefined,
					guests: guestCount,
					notes: notes.trim() || undefined,
					emailConsent,
					smsConsent,
				}),
			});
			const body = (await res.json()) as
				| {
						bookingId: string;
						status: string;
						canPay?: boolean;
						balanceDueCents?: string;
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
					canPay: Boolean(body.canPay),
					balanceDueCents: body.balanceDueCents ?? "0",
				});
				toast.success("Booking confirmed!");
			}
		} catch (err) {
			const msg = getErrorMessage(err);
			setSubmitErr(msg);
			toast.error(msg);
		} finally {
			setSubmitting(false);
		}
	};

	if (confirmation) {
		return (
			<main className="mx-auto max-w-2xl px-4 py-12 space-y-6">
				{/* Success card animates in with a subtle scale + fade so the
				    confirmation feels celebratory without being distracting.
				    Stagger the card and footer link so the eye lands on the
				    reference first, then the CTA. */}
				<motion.div
					initial={{ opacity: 0, scale: 0.96 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.35, ease: "easeOut" }}
				>
					<Card>
						<CardHeader>
							<CardTitle>Booking confirmed</CardTitle>
							<CardDescription>
								Thank you for booking with {data.organizationName}.
								{emailConsent
									? ` We've sent a confirmation to ${email}.`
									: " Save your reference below — email updates were not opted in."}
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<p className="text-sm">
								Reference:{" "}
								<span className="font-mono text-xs">
									{confirmation.bookingId}
								</span>
							</p>
							<p className="text-muted-foreground text-sm">
								Save this reference if you need to contact the operator about
								your booking.
							</p>
							{confirmation.canPay && Number(confirmation.balanceDueCents) > 0 && (
								<div className="space-y-2 rounded-md border p-3">
									<p className="text-sm font-medium">
										Balance due:{" "}
										{formatCentsCompact(BigInt(confirmation.balanceDueCents))}
									</p>
									<p className="text-muted-foreground text-xs">
										Pay securely now via Stripe Checkout.
									</p>
									<Button
										className="w-full"
										disabled={paying}
										onClick={async () => {
											setPaying(true);
											try {
												const { url } = await createPublicCheckout({
													bookingId:
														confirmation.bookingId as Id<"bookings">,
													customerEmail: email.trim().toLowerCase(),
													successPath: `/book/${slug}?paid=1`,
													cancelPath: `/book/${slug}?pay_cancelled=1`,
												});
												window.location.href = url;
											} catch (err) {
												toast.error(getErrorMessage(err));
												setPaying(false);
											}
										}}
									>
										{paying ? "Opening checkout…" : "Pay now"}
									</Button>
								</div>
							)}
							<Button
								variant="outline"
								className="w-full"
								onClick={() => {
									setConfirmation(null);
									setName("");
									setEmail("");
									setPhone("");
									setDate("");
									setStartTime("");
									setScheduleId("");
									setGuests("1");
									setNotes("");
									setEmailConsent(true);
									setSmsConsent(false);
									setSelectedTourId("");
									setBlackoutCheck(null);
									setFieldErr({});
									setSubmitErr(null);
								}}
							>
								Book another
							</Button>
						</CardContent>
					</Card>
				</motion.div>
				<motion.footer
					className="text-center"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.3, delay: 0.2 }}
				>
					<Button variant="link" asChild>
						<Link to="/">← Back to home</Link>
					</Button>
				</motion.footer>
			</main>
		);
	}

	return (
		<main className="mx-auto max-w-2xl px-4 py-12 space-y-6">
			<header className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">
					{data.organizationName}
				</h1>
				<p className="text-muted-foreground">
					Book a tour — no account required.
				</p>
			</header>

			{data.tours.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>No tours available</CardTitle>
						<CardDescription>
							This operator hasn't published any tours yet. Please check back
							later.
						</CardDescription>
					</CardHeader>
				</Card>
			) : (
				<form onSubmit={onSubmit} className="space-y-6">
					<motion.div
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.25, delay: 0 }}
					>
						<Card>
							<CardHeader>
								<CardTitle>1. Choose a tour</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								{fieldErr.tour && (
									<p role="alert" className="text-destructive text-sm">
										{fieldErr.tour}
									</p>
								)}
								{data.tours.map((t: PublicTour) => (
									<label
										key={t._id}
										className={`block border rounded-lg p-4 cursor-pointer transition-colors ${
											selectedTourId === t._id
												? "border-primary bg-accent"
												: "hover:border-muted-foreground"
										}`}
									>
										<div className="flex items-start gap-3">
											<input
												type="radio"
												name="tour"
												value={t._id}
												checked={selectedTourId === t._id}
												onChange={(e) => {
													setSelectedTourId(e.target.value as Id<"tours">);
													setScheduleId("");
													setStartTime("");
													// Re-check blackout for the new tour with the
													// currently-entered date (if any).
													if (date && e.target.value) {
														setBlackoutCheck({
															tourId: e.target.value as Id<"tours">,
															date,
														});
													}
												}}
												className="mt-1"
											/>
											<div className="flex-1">
												<p className="font-medium">{t.name}</p>
												<p className="text-muted-foreground text-sm">
													{t.durationHours}h · up to {t.maxGuests} guests
													{t.basePriceCents !== undefined
														? ` · ${formatPrice(
																Number(t.basePriceCents) / 100,
																t.currency,
															)} pp`
														: ""}
												</p>
												{t.description && (
													<p className="text-sm mt-2">{t.description}</p>
												)}
											</div>
										</div>
									</label>
								))}
							</CardContent>
						</Card>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.25, delay: 0.1 }}
					>
						<Card>
							<CardHeader>
								<CardTitle>2. Pick a date and time</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-1">
										<label htmlFor="date" className="text-sm font-medium">
											Date *
										</label>
										<Input
											id="date"
											type="date"
											required
											min={new Date().toISOString().slice(0, 10)}
											value={date}
											onChange={(e) => {
												setDate(e.target.value);
												setScheduleId("");
												setStartTime("");
												// Trigger the blackout check for this tour+date.
												if (selectedTourId && e.target.value) {
													setBlackoutCheck({
														tourId: selectedTourId,
														date: e.target.value,
													});
												} else {
													setBlackoutCheck(null);
												}
											}}
											aria-invalid={Boolean(fieldErr.date || isBlackedOut)}
											aria-describedby={
												fieldErr.date
													? "date-error"
													: isBlackedOut
														? "date-blackout"
														: undefined
											}
										/>
										{isBlackedOut && !fieldErr.date && (
											<p
												id="date-blackout"
												role="alert"
												className="text-destructive text-xs"
											>
												This date is not available — the operator has blocked
												bookings on this day. Please pick another date.
											</p>
										)}
										{fieldErr.date && (
											<p
												id="date-error"
												role="alert"
												className="text-destructive text-xs"
											>
												{fieldErr.date}
											</p>
										)}
									</div>
									<div className="space-y-1">
										<label htmlFor="time" className="text-sm font-medium">
											Start time *
										</label>
										{slotsLoading ? (
											<p className="text-muted-foreground text-sm py-2">
												Loading available times…
											</p>
										) : hasPublishedSlots ? (
											<select
												id="time"
												required
												className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
												value={scheduleId}
												onChange={(e) => {
													const id = e.target.value as Id<"tourSchedules">;
													setScheduleId(id);
													const slot = availableSlots?.find((s) => s._id === id);
													setStartTime(slot?.startTime ?? "");
												}}
												aria-invalid={Boolean(fieldErr.startTime)}
											>
												<option value="">Select a time…</option>
												{(availableSlots ?? []).map((s) => (
													<option key={s._id} value={s._id}>
														{s.startTime}
														{s.endTime ? `–${s.endTime}` : ""} · {s.seatsLeft}{" "}
														left
													</option>
												))}
											</select>
										) : (
											<Input
												id="time"
												type="time"
												required
												value={startTime}
												onChange={(e) => {
													setStartTime(e.target.value);
													setScheduleId("");
												}}
												disabled={Boolean(isBlackedOut) || !slotReady}
											/>
										)}
										{slotsLoaded && !hasPublishedSlots && !isBlackedOut && (
											<p className="text-muted-foreground text-xs">
												No published times for this date — enter a preferred
												start time.
											</p>
										)}
										{fieldErr.startTime && (
											<p role="alert" className="text-destructive text-xs">
												{fieldErr.startTime}
											</p>
										)}
									</div>
								</div>
								<div className="space-y-1">
									<label htmlFor="guests" className="text-sm font-medium">
										Guests *
									</label>
									<Input
										id="guests"
										type="number"
										min="1"
										max={selectedTour?.maxGuests ?? 20}
										required
										value={guests}
										onChange={(e) => setGuests(e.target.value)}
										aria-invalid={Boolean(fieldErr.guests)}
										aria-describedby={
											fieldErr.guests ? "guests-error" : undefined
										}
									/>
									{selectedTour && !fieldErr.guests && (
										<p className="text-muted-foreground text-xs">
											Max {selectedTour.maxGuests} guests
										</p>
									)}
									{fieldErr.guests && (
										<p
											id="guests-error"
											role="alert"
											className="text-destructive text-xs"
										>
											{fieldErr.guests}
										</p>
									)}
								</div>
							</CardContent>
						</Card>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.25, delay: 0.2 }}
					>
						<Card>
							<CardHeader>
								<CardTitle>3. Your details</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-1">
									<label htmlFor="name" className="text-sm font-medium">
										Full name *
									</label>
									<Input
										id="name"
										required
										maxLength={MAX_NAME_LEN}
										value={name}
										onChange={(e) => setName(e.target.value)}
										aria-invalid={Boolean(fieldErr.name)}
										aria-describedby={fieldErr.name ? "name-error" : undefined}
									/>
									{fieldErr.name && (
										<p
											id="name-error"
											role="alert"
											className="text-destructive text-xs"
										>
											{fieldErr.name}
										</p>
									)}
								</div>
								<div className="space-y-1">
									<label htmlFor="email" className="text-sm font-medium">
										Email *
									</label>
									<Input
										id="email"
										type="email"
										required
										maxLength={MAX_EMAIL_LEN}
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										aria-invalid={Boolean(fieldErr.email)}
										aria-describedby={
											fieldErr.email ? "email-error" : undefined
										}
									/>
									{fieldErr.email && (
										<p
											id="email-error"
											role="alert"
											className="text-destructive text-xs"
										>
											{fieldErr.email}
										</p>
									)}
								</div>
								<div className="space-y-1">
									<label htmlFor="phone" className="text-sm font-medium">
										Phone (optional)
									</label>
									<Input
										id="phone"
										type="tel"
										maxLength={MAX_PHONE_LEN}
										value={phone}
										onChange={(e) => setPhone(e.target.value)}
										aria-invalid={Boolean(fieldErr.phone)}
										aria-describedby={
											fieldErr.phone ? "phone-error" : undefined
										}
									/>
									{fieldErr.phone && (
										<p
											id="phone-error"
											role="alert"
											className="text-destructive text-xs"
										>
											{fieldErr.phone}
										</p>
									)}
								</div>
								<div className="space-y-1">
									<label htmlFor="notes" className="text-sm font-medium">
										Special requests (optional)
									</label>
									<Textarea
										id="notes"
										value={notes}
										onChange={(e) => setNotes(e.target.value)}
										rows={3}
										maxLength={MAX_NOTES_LEN}
										placeholder="Allergies, accessibility needs, etc."
										aria-invalid={Boolean(fieldErr.notes)}
										aria-describedby={
											fieldErr.notes ? "notes-error" : undefined
										}
									/>
									<p className="text-muted-foreground text-xs text-right">
										{notes.length} / {MAX_NOTES_LEN}
									</p>
									{fieldErr.notes && (
										<p
											id="notes-error"
											role="alert"
											className="text-destructive text-xs"
										>
											{fieldErr.notes}
										</p>
									)}
								</div>
								<div className="space-y-3 rounded-md border p-3">
									<label className="flex items-start gap-2 text-sm">
										<input
											type="checkbox"
											className="mt-1"
											checked={emailConsent}
											onChange={(e) => setEmailConsent(e.target.checked)}
										/>
										<span>
											Email me booking updates and reminders
											<span className="text-muted-foreground block text-xs">
												Recommended so we can send your confirmation.
											</span>
										</span>
									</label>
									<label className="flex items-start gap-2 text-sm">
										<input
											type="checkbox"
											className="mt-1"
											checked={smsConsent}
											onChange={(e) => setSmsConsent(e.target.checked)}
										/>
										<span>
											Text me reminders (optional)
											<span className="text-muted-foreground block text-xs">
												Only if you provide a phone number.
											</span>
										</span>
									</label>
								</div>
							</CardContent>
							<CardFooter className="flex flex-col gap-3">
								{submitErr && <ErrorBanner message={submitErr} />}
								<Button
									type="submit"
									disabled={submitting || slotsLoading}
									className="w-full"
								>
									{submitting
										? "Booking…"
										: slotsLoading
											? "Loading times…"
											: "Confirm booking"}
								</Button>
								<p className="text-muted-foreground text-xs text-center">
									By booking you agree to the operator's cancellation policy.
									{emailConsent
										? " We'll email your confirmation."
										: " You opted out of email updates."}
								</p>
							</CardFooter>
						</Card>
					</motion.div>
				</form>
			)}

			<footer className="text-center">
				<Button variant="link" asChild>
					<Link to="/">← Back to home</Link>
				</Button>
			</footer>
		</main>
	);
}

function formatPrice(value: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency || "USD",
	}).format(value);
}
