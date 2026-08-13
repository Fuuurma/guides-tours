import { convexQuery } from "@convex-dev/react-query";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { Check, MapPin } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { StripePaymentElement } from "@/components/stripe-payment-element";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatCentsCompact } from "@/lib/format";
import {
	publicBookingDefaults,
	publicBookingSchema,
} from "@/lib/public-booking-form";
import {
	cn,
	getErrorMessage,
	getSafeDisplayMessage,
	isStripeCheckoutUrl,
} from "@/lib/utils";
import {
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
	const publicOrganizationId = data?.organizationId;

	const [blackoutCheck, setBlackoutCheck] = useState<{
		organizationId: string;
		tourId: Id<"tours">;
		date: string;
	} | null>(null);
	const { data: isBlackedOut } = useQuery(
		convexQuery(
			api.tourBlackoutDates.publicIsBlackout,
			blackoutCheck
				? {
						organizationId: blackoutCheck.organizationId,
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
	const [paying, setPaying] = useState(false);
	const [elementsClientSecret, setElementsClientSecret] = useState<
		string | null
	>(null);
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
			const selectedSlot = availableSlots?.find(
				(s) => s._id === value.scheduleId,
			);

			if (slotsLoading) {
				form.setFieldMeta("startTime", (prev) => ({
					...prev,
					errorMap: {
						...prev.errorMap,
						onSubmit: "Loading available times…",
					},
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
					errorMap: {
						...prev.errorMap,
						onSubmit: "Start time is required",
					},
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
				const msg = getErrorMessage(err);
				setSubmitErr(msg);
				toast.error(msg);
			}
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
			if (publicOrganizationId) {
				setBlackoutCheck({
					organizationId: publicOrganizationId,
					tourId: tourId as Id<"tours">,
					date,
				});
			}
		} else {
			setBlackoutCheck(null);
		}
	}, [tourId, date, publicOrganizationId]);

	if (isPending) {
		return (
			<PublicBookingFrame>
				<div className="flex flex-col gap-4">
					<Skeleton className="h-8 w-2/3" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-32 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			</PublicBookingFrame>
		);
	}

	if (error) {
		return (
			<PublicBookingFrame>
				<Empty className="border">
					<EmptyHeader>
						<EmptyTitle>Could not load this page</EmptyTitle>
						<EmptyDescription>{getSafeDisplayMessage(error)}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</PublicBookingFrame>
		);
	}

	if (!data) {
		return (
			<PublicBookingFrame>
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
				<motion.div
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3, ease: "easeOut" }}
				>
					<Card>
						<CardHeader className="items-center text-center">
							<span className="mb-2 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
								<Check />
							</span>
							<h2 className="text-2xl font-semibold tracking-tight">
								Booking request received
							</h2>
							<CardDescription>
								Thank you for requesting a tour with {data.organizationName}.
								The operator will confirm this request before it is final.
								{confirmation.emailConsent
									? ` We'll email ${confirmation.email} when the operator confirms.`
									: " Save your reference below — email updates were not opted in."}
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<p className="text-center text-sm">
								Reference:{" "}
								<span className="font-mono text-xs">
									{confirmation.bookingId}
								</span>
							</p>
							{confirmation.canPay &&
								Number(confirmation.balanceDueCents) > 0 && (
									<div className="flex flex-col gap-3 rounded-md border p-3">
										<p className="text-sm font-medium">
											Balance due:{" "}
											{formatCentsCompact(BigInt(confirmation.balanceDueCents))}
										</p>
										{elementsClientSecret &&
										confirmation.stripePublishableKey ? (
											<StripePaymentElement
												publishableKey={confirmation.stripePublishableKey}
												clientSecret={elementsClientSecret}
												returnUrl={
													typeof window !== "undefined"
														? `${window.location.origin}/book/${slug}?paid=1`
														: `/book/${slug}?paid=1`
												}
												amountLabel={formatCentsCompact(
													BigInt(confirmation.balanceDueCents),
												)}
												onPaid={() => {
													toast.success(
														"Payment submitted — you’ll get a confirmation shortly",
													);
													setElementsClientSecret(null);
												}}
												onCancel={() => setElementsClientSecret(null)}
											/>
										) : (
											<>
												<p className="text-xs text-muted-foreground">
													Pay securely with Stripe — on this page or via hosted
													Checkout.
												</p>
												<div className="flex flex-col gap-2 sm:flex-row">
													{confirmation.stripePublishableKey ? (
														<Button
															className="w-full"
															disabled={paying}
															onClick={async () => {
																setPaying(true);
																try {
																	const result =
																		await createPublicPaymentIntent({
																			bookingId:
																				confirmation.bookingId as Id<"bookings">,
																			customerEmail:
																				confirmation.email.toLowerCase(),
																		});
																	setElementsClientSecret(result.clientSecret);
																} catch (err) {
																	toast.error(getErrorMessage(err));
																} finally {
																	setPaying(false);
																}
															}}
														>
															{paying ? (
																<Spinner data-icon="inline-start" />
															) : null}
															{paying ? "Preparing…" : "Pay on this page"}
														</Button>
													) : null}
													<Button
														className="w-full"
														variant={
															confirmation.stripePublishableKey
																? "outline"
																: "default"
														}
														disabled={paying}
														onClick={async () => {
															setPaying(true);
															try {
																const { url } = await createPublicCheckout({
																	bookingId:
																		confirmation.bookingId as Id<"bookings">,
																	customerEmail:
																		confirmation.email.toLowerCase(),
																	successPath: `/book/${slug}?paid=1`,
																	cancelPath: `/book/${slug}?pay_cancelled=1`,
																});
																if (!isStripeCheckoutUrl(url)) {
																	toast.error("Invalid checkout URL received");
																	setPaying(false);
																	return;
																}
																window.location.href = url;
															} catch (err) {
																toast.error(getErrorMessage(err));
																setPaying(false);
															}
														}}
													>
														{paying ? (
															<Spinner data-icon="inline-start" />
														) : null}
														{paying ? "Opening checkout…" : "Stripe Checkout"}
													</Button>
												</div>
											</>
										)}
									</div>
								)}
							<Button
								variant="outline"
								className="w-full"
								onClick={() => {
									setConfirmation(null);
									setElementsClientSecret(null);
									setSubmitErr(null);
									setBlackoutCheck(null);
									form.reset();
								}}
							>
								Book another
							</Button>
						</CardContent>
					</Card>
				</motion.div>
			</PublicBookingFrame>
		);
	}

	return (
		<PublicBookingFrame orgName={data.organizationName}>
			<header className="mb-8">
				<h1 className="text-3xl font-semibold tracking-[-0.05em]">
					Book with{" "}
					<span className="font-display font-normal italic tracking-normal text-chart-1">
						{data.organizationName}
					</span>
				</h1>
				<p className="mt-2 text-base text-muted-foreground">
					Request a tour — no account required. The operator confirms before it
					is final.
				</p>
			</header>

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
				<motion.div
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.25, ease: "easeOut" }}
				>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							void form.handleSubmit();
						}}
					>
						<Card>
							<CardContent className="flex flex-col gap-8 pt-6">
								<FieldGroup className="gap-8">
									<section className="flex flex-col gap-3">
										<h2 className="text-sm font-medium">Tour</h2>
										<form.Field name="tourId">
											{(field) => (
												<>
													{field.state.meta.errors.length > 0 && (
														<p
															role="alert"
															className="text-sm text-destructive"
														>
															{String(field.state.meta.errors[0])}
														</p>
													)}
													{data.tours.map((t: PublicTour) => (
														<label
															key={t._id}
															htmlFor={`tour-${t._id}`}
															className={cn(
																"block cursor-pointer rounded-lg border p-4 transition-colors",
																field.state.value === t._id
																	? "border-primary bg-accent"
																	: "hover:bg-muted/40",
															)}
														>
															<div className="flex items-start gap-3">
																<input
																	id={`tour-${t._id}`}
																	type="radio"
																	name={field.name}
																	value={t._id}
																	checked={field.state.value === t._id}
																	onBlur={field.handleBlur}
																	onChange={() => {
																		field.handleChange(t._id);
																		form.setFieldValue("scheduleId", "");
																		form.setFieldValue("startTime", "");
																	}}
																	className="mt-1"
																/>
																<div className="flex-1">
																	<p className="font-medium">{t.name}</p>
																	<p className="text-sm text-muted-foreground">
																		{t.durationHours}h · up to {t.maxGuests}{" "}
																		guests
																		{t.basePriceCents !== undefined
																			? ` · ${formatPrice(
																					Number(t.basePriceCents) / 100,
																					t.currency,
																				)} pp`
																			: ""}
																	</p>
																	{t.description && (
																		<p className="mt-2 text-sm">
																			{t.description}
																		</p>
																	)}
																</div>
															</div>
														</label>
													))}
												</>
											)}
										</form.Field>
									</section>

									<Separator />

									<section className="flex flex-col gap-4">
										<h2 className="text-sm font-medium">Date and time</h2>
										<div className="grid gap-4 sm:grid-cols-2">
											<form.Field name="date">
												{(field) => (
													<FormField
														field={field}
														label="Date *"
														hint={
															isBlackedOut
																? "This date is not available — the operator has blocked bookings on this day."
																: undefined
														}
													>
														<Input
															id={field.name}
															name={field.name}
															type="date"
															required
															min={new Date().toISOString().slice(0, 10)}
															value={field.state.value}
															onBlur={field.handleBlur}
															onChange={(e) => {
																field.handleChange(e.target.value);
																form.setFieldValue("scheduleId", "");
																form.setFieldValue("startTime", "");
															}}
															aria-invalid={
																field.state.meta.errors.length > 0 ||
																Boolean(isBlackedOut)
															}
														/>
													</FormField>
												)}
											</form.Field>

											<form.Field name="startTime">
												{(field) => (
													<Field
														data-invalid={field.state.meta.errors.length > 0}
													>
														<FieldLabel htmlFor="time">Start time *</FieldLabel>
														{slotsLoading ? (
															<p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
																<Spinner />
																Loading available times…
															</p>
														) : hasPublishedSlots ? (
															<select
																id="time"
																required
																className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
																value={scheduleId}
																onBlur={field.handleBlur}
																onChange={(e) => {
																	const id = e.target.value;
																	form.setFieldValue("scheduleId", id);
																	const slot = availableSlots?.find(
																		(s) => s._id === id,
																	);
																	field.handleChange(slot?.startTime ?? "");
																}}
																aria-invalid={
																	field.state.meta.errors.length > 0
																}
															>
																<option value="">Select a time…</option>
																{(availableSlots ?? []).map((s) => (
																	<option key={s._id} value={s._id}>
																		{s.startTime}
																		{s.endTime ? `–${s.endTime}` : ""} ·{" "}
																		{s.seatsLeft} left
																	</option>
																))}
															</select>
														) : (
															<Input
																id="time"
																type="time"
																required
																value={field.state.value}
																onBlur={field.handleBlur}
																onChange={(e) => {
																	field.handleChange(e.target.value);
																	form.setFieldValue("scheduleId", "");
																}}
																disabled={Boolean(isBlackedOut) || !slotReady}
															/>
														)}
														{slotsLoaded &&
															!hasPublishedSlots &&
															!isBlackedOut && (
																<FieldDescription>
																	No published times for this date — enter a
																	preferred start time.
																</FieldDescription>
															)}
														<FieldError
															errors={field.state.meta.errors.map((err) => ({
																message: String(err),
															}))}
														/>
													</Field>
												)}
											</form.Field>
										</div>

										<form.Field name="guests">
											{(field) => (
												<FormField
													field={field}
													label="Guests *"
													hint={
														selectedTour
															? `Max ${selectedTour.maxGuests} guests`
															: undefined
													}
													inputProps={{
														type: "number",
														min: 1,
														max: selectedTour?.maxGuests ?? 20,
														required: true,
													}}
												/>
											)}
										</form.Field>
									</section>

									<Separator />

									<section className="flex flex-col gap-4">
										<h2 className="text-sm font-medium">Your details</h2>
										<form.Field name="name">
											{(field) => (
												<FormField
													field={field}
													label="Full name *"
													inputProps={{
														required: true,
														maxLength: MAX_NAME_LEN,
														autoComplete: "name",
													}}
												/>
											)}
										</form.Field>
										<form.Field name="email">
											{(field) => (
												<FormField
													field={field}
													label="Email *"
													inputProps={{
														type: "email",
														required: true,
														maxLength: MAX_EMAIL_LEN,
														autoComplete: "email",
													}}
												/>
											)}
										</form.Field>
										<form.Field name="phone">
											{(field) => (
												<FormField
													field={field}
													label="Phone (optional)"
													inputProps={{
														type: "tel",
														maxLength: MAX_PHONE_LEN,
														autoComplete: "tel",
													}}
												/>
											)}
										</form.Field>
										<form.Field name="notes">
											{(field) => (
												<FormField
													field={field}
													label="Special requests (optional)"
												>
													<Textarea
														id={field.name}
														name={field.name}
														value={field.state.value}
														onBlur={field.handleBlur}
														onChange={(e) => field.handleChange(e.target.value)}
														rows={3}
														maxLength={MAX_NOTES_LEN}
														placeholder="Allergies, accessibility needs, etc."
														aria-invalid={field.state.meta.errors.length > 0}
													/>
													<p className="text-right text-xs text-muted-foreground">
														{field.state.value.length} / {MAX_NOTES_LEN}
													</p>
												</FormField>
											)}
										</form.Field>

										<div className="flex flex-col gap-3 rounded-md border p-3">
											<form.Field name="emailConsent">
												{(field) => (
													<label
														htmlFor="emailConsent"
														className="flex items-start gap-2 text-sm"
													>
														<Checkbox
															id="emailConsent"
															checked={field.state.value}
															onCheckedChange={(checked) =>
																field.handleChange(checked === true)
															}
															className="mt-1"
														/>
														<span>
															Email me booking updates and reminders
															<span className="block text-xs text-muted-foreground">
																Recommended so we can send your confirmation.
															</span>
														</span>
													</label>
												)}
											</form.Field>
											<form.Field name="smsConsent">
												{(field) => (
													<label
														htmlFor="smsConsent"
														className="flex items-start gap-2 text-sm"
													>
														<Checkbox
															id="smsConsent"
															checked={field.state.value}
															onCheckedChange={(checked) =>
																field.handleChange(checked === true)
															}
															className="mt-1"
														/>
														<span>
															Text me reminders (optional)
															<span className="block text-xs text-muted-foreground">
																Only if you provide a phone number.
															</span>
														</span>
													</label>
												)}
											</form.Field>
										</div>
									</section>
								</FieldGroup>
							</CardContent>
							<CardFooter className="flex flex-col gap-3">
								{submitErr && <ErrorBanner message={submitErr} />}
								<form.Subscribe
									selector={(s) => [s.canSubmit, s.isSubmitting] as const}
								>
									{([canSubmit, isSubmitting]) => (
										<Button
											type="submit"
											disabled={!canSubmit || isSubmitting || slotsLoading}
											className="w-full"
										>
											{isSubmitting || slotsLoading ? (
												<Spinner data-icon="inline-start" />
											) : null}
											{isSubmitting
												? "Booking…"
												: slotsLoading
													? "Loading times…"
													: "Request booking"}
										</Button>
									)}
								</form.Subscribe>
								<p className="text-center text-xs text-muted-foreground">
									By requesting you agree to the operator&apos;s cancellation
									policy.
									{emailConsent
										? " We'll email you when the operator confirms."
										: " You opted out of email updates."}
								</p>
							</CardFooter>
						</Card>
					</form>
				</motion.div>
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

function formatPrice(value: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency || "USD",
	}).format(value);
}
