import { convexQuery } from "@convex-dev/react-query";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { DetailPage, PageBackLink } from "@/components/detail-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { centsToInputValue } from "@/lib/format";
import { getErrorMessage } from "@/lib/utils";
import {
	MAX_GUEST_NAMES_LEN,
	MAX_NOTES_LEN,
	MAX_PAYMENT_METHOD_LEN,
	MAX_SHORT_FIELD_LEN,
	parseUsdToCents,
	validateNotesOptional,
	validatePositiveInteger,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type ScheduleLite = {
	_id: string;
	startTime: string;
	endTime: string;
	capacityTotal: number;
	capacityBooked: number;
	status: string;
};

type BookingValues = {
	date: string;
	startTime: string;
	guests: string;
	guestNames: string;
	languageRequired: string;
	notes: string;
	depositUsd: string;
	totalUsd: string;
	paymentMethod: string;
	scheduleId: string;
};

function metaErrors(
	errors: ReadonlyArray<unknown>,
): Array<{ message?: string }> {
	return errors.map((err) => {
		if (typeof err === "string") return { message: err };
		if (err && typeof err === "object" && "message" in err) {
			const message = (err as { message?: unknown }).message;
			if (typeof message === "string") return { message };
		}
		return { message: String(err) };
	});
}

interface EditBookingPageProps {
	bookingId: string;
}

export function EditBookingPage({ bookingId }: EditBookingPageProps) {
	const booking = useQuery(
		convexQuery(api.bookings.get, {
			bookingId: bookingId as Id<"bookings">,
		}),
	);

	if (booking.isPending) {
		return <DetailSkeleton />;
	}
	if (booking.error || booking.data === null) {
		return (
			<DetailPage title="Booking not found" backTo="/dashboard/bookings" />
		);
	}

	const row = booking.data;
	const status = row.status;
	if (status === "completed" || status === "cancelled") {
		return (
			<div className="mx-auto flex max-w-2xl flex-col gap-4">
				<PageBackLink to={`/dashboard/bookings/${bookingId}`} />
				<h1 className="text-2xl font-semibold tracking-tight">
					Cannot edit booking
				</h1>
				<p className="text-sm text-muted-foreground">
					This booking is <span className="font-medium">{status}</span> — only
					active bookings (pending / confirmed / checked-in) can be edited.
				</p>
			</div>
		);
	}

	return <EditBookingForm bookingId={bookingId} booking={row} />;
}

function EditBookingForm({
	bookingId,
	booking,
}: {
	bookingId: string;
	booking: {
		tourId: Id<"tours">;
		date: string;
		startTime: string;
		guests: number;
		guestNames?: string;
		languageRequired?: string;
		notes?: string;
		depositAmountCents?: bigint | number;
		totalAmountCents?: bigint | number;
		paymentMethod?: string;
		scheduleId?: string;
	};
}) {
	const navigate = useNavigate();
	const update = useMutation(api.bookings.update);
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			date: booking.date,
			startTime: booking.startTime,
			guests: String(booking.guests),
			guestNames: booking.guestNames ?? "",
			languageRequired: booking.languageRequired ?? "",
			notes: booking.notes ?? "",
			depositUsd: centsToInputValue(booking.depositAmountCents),
			totalUsd: centsToInputValue(booking.totalAmountCents),
			paymentMethod: booking.paymentMethod ?? "",
			scheduleId: booking.scheduleId ?? "",
		} satisfies BookingValues,
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (name: keyof BookingValues, message: string) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};

			if (!value.date) fail("date", "Date is required");
			if (!value.startTime) fail("startTime", "Start time is required");
			const guestsErr = validatePositiveInteger(value.guests, "Guests");
			if (guestsErr) fail("guests", guestsErr);
			const notesErr = validateNotesOptional(value.notes);
			if (notesErr) fail("notes", notesErr);
			if (value.guestNames.trim().length > MAX_GUEST_NAMES_LEN) {
				fail(
					"guestNames",
					`Guest names are too long (max ${MAX_GUEST_NAMES_LEN} characters)`,
				);
			}
			if (value.languageRequired.trim().length > MAX_SHORT_FIELD_LEN) {
				fail(
					"languageRequired",
					`Language is too long (max ${MAX_SHORT_FIELD_LEN} characters)`,
				);
			}
			if (value.paymentMethod.trim().length > MAX_PAYMENT_METHOD_LEN) {
				fail(
					"paymentMethod",
					`Payment method is too long (max ${MAX_PAYMENT_METHOD_LEN} characters)`,
				);
			}

			const totalCents = value.totalUsd.trim()
				? parseUsdToCents(value.totalUsd)
				: null;
			if (value.totalUsd.trim() && totalCents === null) {
				fail("totalUsd", "Total amount must be a non-negative number");
			}
			const depositCents = value.depositUsd.trim()
				? parseUsdToCents(value.depositUsd)
				: null;
			if (value.depositUsd.trim() && depositCents === null) {
				fail("depositUsd", "Deposit must be a non-negative number");
			} else if (
				depositCents !== null &&
				totalCents !== null &&
				depositCents > totalCents
			) {
				fail("depositUsd", "Deposit cannot exceed the total amount");
			}
			if (invalid) return;

			try {
				await update({
					bookingId: bookingId as Id<"bookings">,
					date: value.date,
					startTime: value.startTime,
					guests: Number(value.guests),
					guestNames: value.guestNames.trim() || undefined,
					languageRequired: value.languageRequired.trim() || undefined,
					notes: value.notes.trim() || undefined,
					depositAmountCents: depositCents ?? undefined,
					totalAmountCents: totalCents ?? undefined,
					paymentMethod: value.paymentMethod.trim() || undefined,
					scheduleId: value.scheduleId
						? (value.scheduleId as Id<"tourSchedules">)
						: undefined,
				});
				toast.success("Booking updated");
				void navigate({
					to: "/dashboard/bookings/$bookingId",
					params: { bookingId },
				});
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
			}
		},
	});

	const date = useStore(form.store, (s) => s.values.date);
	const notesLen = useStore(form.store, (s) => s.values.notes.length);
	const { data: schedules } = useQuery(
		convexQuery(
			api.tourSchedules.list,
			booking.tourId && date
				? {
						tourId: booking.tourId,
						dateFrom: date,
						dateTo: date,
					}
				: "skip",
		),
	);
	const slots = ((schedules ?? []) as ScheduleLite[]).filter(
		(s) => s.status !== "cancelled",
	);

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<div>
				<PageBackLink to={`/dashboard/bookings/${bookingId}`} />
				<h1 className="mt-2 text-2xl font-semibold tracking-tight">
					Edit booking
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Rescheduling checks blackouts and capacity. Confirm, check in, and
					cancel from the booking page.
				</p>
			</div>
			<Card>
				<CardContent className="pt-6">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							void form.handleSubmit();
						}}
					>
						<FieldGroup className="gap-4">
							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<form.Field name="date">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="edit-date">Date</FieldLabel>
											<Input
												id="edit-date"
												type="date"
												required
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => {
													field.handleChange(e.target.value);
													form.setFieldValue("scheduleId", "");
												}}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>

								{slots.length > 0 ? (
									<form.Field name="scheduleId">
										{(field) => (
											<Field data-invalid={!field.state.meta.isValid}>
												<FieldLabel htmlFor="edit-slot">
													Schedule slot
												</FieldLabel>
												<Select
													value={field.state.value || undefined}
													onValueChange={(id) => {
														field.handleChange(id);
														const slot = slots.find((s) => s._id === id);
														if (slot) {
															form.setFieldValue("startTime", slot.startTime);
														}
													}}
												>
													<SelectTrigger id="edit-slot">
														<SelectValue placeholder="Select a time…" />
													</SelectTrigger>
													<SelectContent>
														<SelectGroup>
															{slots.map((s) => (
																<SelectItem key={s._id} value={s._id}>
																	{s.startTime}–{s.endTime} ·{" "}
																	{s.capacityTotal - s.capacityBooked} left
																</SelectItem>
															))}
														</SelectGroup>
													</SelectContent>
												</Select>
												<FieldError
													errors={metaErrors(field.state.meta.errors)}
												/>
											</Field>
										)}
									</form.Field>
								) : (
									<form.Field name="startTime">
										{(field) => (
											<Field data-invalid={!field.state.meta.isValid}>
												<FieldLabel htmlFor="edit-time">Start time</FieldLabel>
												<Input
													id="edit-time"
													type="time"
													required
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => {
														field.handleChange(e.target.value);
														form.setFieldValue("scheduleId", "");
													}}
													aria-invalid={!field.state.meta.isValid}
												/>
												<FieldError
													errors={metaErrors(field.state.meta.errors)}
												/>
											</Field>
										)}
									</form.Field>
								)}

								<form.Field name="guests">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="edit-guests">Guests</FieldLabel>
											<Input
												id="edit-guests"
												type="number"
												min="1"
												required
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							<form.Field name="guestNames">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="edit-guest-names">
											Guest names
										</FieldLabel>
										<Input
											id="edit-guest-names"
											maxLength={MAX_GUEST_NAMES_LEN}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="Jane, John"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldDescription>Comma-separated</FieldDescription>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<form.Field name="languageRequired">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="edit-lang">
											Language required
										</FieldLabel>
										<Input
											id="edit-lang"
											maxLength={MAX_SHORT_FIELD_LEN}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="en, es, fr"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<form.Field name="notes">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="edit-notes">Notes</FieldLabel>
										<Textarea
											id="edit-notes"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											rows={3}
											maxLength={MAX_NOTES_LEN}
											placeholder="Allergies, special requests…"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldDescription>
											{notesLen} / {MAX_NOTES_LEN}
										</FieldDescription>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<form.Field name="totalUsd">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="edit-total">Total (USD)</FieldLabel>
											<Input
												id="edit-total"
												type="number"
												step="0.01"
												min="0"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="depositUsd">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="edit-deposit">
												Deposit (USD)
											</FieldLabel>
											<Input
												id="edit-deposit"
												type="number"
												step="0.01"
												min="0"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="paymentMethod">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="edit-payment">
												Payment method
											</FieldLabel>
											<Input
												id="edit-payment"
												maxLength={MAX_PAYMENT_METHOD_LEN}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="card, cash, invoice…"
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							{submitErr ? <ErrorBanner message={submitErr} /> : null}

							<form.Subscribe
								selector={(state) =>
									[state.canSubmit, state.isSubmitting] as const
								}
							>
								{([canSubmit, isSubmitting]) => (
									<div className="flex justify-end gap-2 pt-2">
										<Button type="button" variant="outline" asChild>
											<Link
												to="/dashboard/bookings/$bookingId"
												params={{ bookingId }}
											>
												Back
											</Link>
										</Button>
										<Button type="submit" disabled={!canSubmit || isSubmitting}>
											{isSubmitting ? (
												<Spinner data-icon="inline-start" />
											) : null}
											{isSubmitting ? "Saving…" : "Save changes"}
										</Button>
									</div>
								)}
							</form.Subscribe>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}

// Route declaration lives in src/routes/dashboard/bookings/$bookingId/edit.tsx
// to keep page components decoupled from TanStack Router wiring.
