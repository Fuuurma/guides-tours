import { useForm } from "@tanstack/react-form";
import { Check } from "lucide-react";
import { domAnimation, LazyMotion, m, useReducedMotion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { StripePaymentElement } from "@/components/stripe-payment-element";
import { TourOption } from "@/components/tour-option";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useTodayYmd } from "@/hooks/use-today-ymd";
import { formatCentsCompact } from "@/lib/format";
import {
	publicBookingDefaults,
	publicBookingSchema,
} from "@/lib/public-booking-form";
import { getSafeDisplayMessage, isStripeCheckoutUrl } from "@/lib/utils";
import {
	MAX_EMAIL_LEN,
	MAX_NAME_LEN,
	MAX_NOTES_LEN,
	MAX_PHONE_LEN,
} from "@/lib/validation";
import type { Id } from "../../../convex/_generated/dataModel";

export interface PublicTour {
	_id: string;
	name: string;
	description: string;
	durationHours: number;
	maxGuests: number;
	currency: string;
	basePriceCents: bigint | number | undefined;
	primaryImageUrl: string | null;
	primaryImageAlt: string | null;
}

/**
 * Mirrors the page's exact useForm options so BookingFormApi matches the
 * type the page's form infers (the schema validator changes the generic
 * instantiation, so a bare useForm<Values>() would not match). Type-level
 * only — never called; hook-named so the hook-in-function lint holds.
 */
function useBookingFormSpec() {
	return useForm({
		defaultValues: publicBookingDefaults,
		validators: { onSubmit: publicBookingSchema },
	});
}

export type BookingFormApi = ReturnType<typeof useBookingFormSpec>;

export interface BookingConfirmation {
	bookingId: string;
	status: string;
	canPay: boolean;
	balanceDueCents: string;
	email: string;
	emailConsent: boolean;
	stripePublishableKey?: string;
}

/**
 * The two public booking branches, split out of the route so the page
 * component stays under the giant-component line. Payment actions and the
 * reset callback are passed in; toasts stay local to the branch that
 * raises them.
 */
export function BookingConfirmationCard({
	confirmation,
	organizationName,
	slug,
	createPaymentIntent,
	createCheckout,
	onBookAnother,
}: {
	confirmation: BookingConfirmation;
	organizationName: string;
	slug: string;
	createPaymentIntent: (args: {
		bookingId: Id<"bookings">;
		customerEmail: string;
	}) => Promise<{ clientSecret: string }>;
	createCheckout: (args: {
		bookingId: Id<"bookings">;
		customerEmail: string;
		successPath: string;
		cancelPath: string;
	}) => Promise<{ url: string }>;
	onBookAnother: () => void;
}) {
	const reduceMotion = useReducedMotion();
	const [paying, setPaying] = useState(false);
	const [elementsClientSecret, setElementsClientSecret] = useState<
		string | null
	>(null);
	return (
		<LazyMotion features={domAnimation}>
			<m.div
				initial={reduceMotion ? false : { opacity: 0, y: 6 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3, ease: "easeOut" }}
			>
				<Card>
					<CardHeader className="items-center text-center">
						<span className="mb-2 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
							<Check aria-hidden="true" />
						</span>
						<h2 className="font-display text-2xl font-normal tracking-tight">
							Booking request received
						</h2>
						<CardDescription>
							Thank you for requesting a tour with {organizationName}. The
							operator will confirm this request before it is final.
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
									{elementsClientSecret && confirmation.stripePublishableKey ? (
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
																const result = await createPaymentIntent({
																	bookingId:
																		confirmation.bookingId as Id<"bookings">,
																	customerEmail:
																		confirmation.email.toLowerCase(),
																});
																setElementsClientSecret(result.clientSecret);
															} catch (err) {
																toast.error(getSafeDisplayMessage(err));
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
															const { url } = await createCheckout({
																bookingId:
																	confirmation.bookingId as Id<"bookings">,
																customerEmail: confirmation.email.toLowerCase(),
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
															toast.error(getSafeDisplayMessage(err));
															setPaying(false);
														}
													}}
												>
													{paying ? <Spinner data-icon="inline-start" /> : null}
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
							onClick={onBookAnother}
						>
							Book another
						</Button>
					</CardContent>
				</Card>
			</m.div>
		</LazyMotion>
	);
}

export function BookingRequestForm({
	form,
	tours,
	availableSlots,
	slotsLoading,
	slotsLoaded,
	hasPublishedSlots,
	isBlackedOut,
	slotReady,
	selectedTour,
	scheduleId,
	emailConsent,
	submitErr,
}: {
	form: BookingFormApi;
	tours: PublicTour[];
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
	isBlackedOut: boolean | undefined;
	slotReady: boolean;
	selectedTour: PublicTour | undefined;
	scheduleId: string;
	emailConsent: boolean;
	submitErr: string | null;
}) {
	const reduceMotion = useReducedMotion();
	const today = useTodayYmd();
	return (
		<LazyMotion features={domAnimation}>
			<m.div
				initial={reduceMotion ? false : { opacity: 0, y: 6 }}
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
													<p role="alert" className="text-sm text-destructive">
														{String(field.state.meta.errors[0])}
													</p>
												)}
												{tours.map((t: PublicTour) => (
													<TourOption
														key={t._id}
														tour={t}
														fieldName={field.name}
														checked={field.state.value === t._id}
														onBlur={field.handleBlur}
														onSelect={() => {
															field.handleChange(t._id);
															form.setFieldValue("scheduleId", "");
															form.setFieldValue("startTime", "");
														}}
													/>
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
														min={today}
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
															aria-invalid={field.state.meta.errors.length > 0}
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
			</m.div>
		</LazyMotion>
	);
}
