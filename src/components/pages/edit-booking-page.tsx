import { convexQuery } from "@convex-dev/react-query";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { DetailPage, PageBackLink } from "@/components/detail-page";
import {
	BookingDateTimeField,
	type BookingFieldBinding,
	BookingNotesField,
	BookingNumberField,
	BookingSlotField,
	BookingTextField,
	type ScheduleLite,
} from "@/components/pages/edit-booking-fields";
import {
	type BookingValues,
	buildBookingUpdate,
	validateBookingDraft,
} from "@/components/pages/edit-booking-validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { FieldGroup } from "@/components/ui/field";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { centsToInputValue } from "@/lib/format";
import { getSafeDisplayMessage } from "@/lib/utils";
import {
	MAX_GUEST_NAMES_LEN,
	MAX_NOTES_LEN,
	MAX_PAYMENT_METHOD_LEN,
	MAX_SHORT_FIELD_LEN,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

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

type BindableField = {
	state: {
		value: string;
		meta: { isValid: boolean; errors: ReadonlyArray<unknown> };
	};
	handleChange: (value: string) => void;
	handleBlur: () => void;
};

function bindField(
	field: BindableField,
	onChange?: (value: string) => void,
): BookingFieldBinding {
	return {
		value: field.state.value,
		onChange: onChange ?? field.handleChange,
		onBlur: field.handleBlur,
		invalid: !field.state.meta.isValid,
		errors: metaErrors(field.state.meta.errors),
	};
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
				<h1 className="font-display text-2xl font-medium tracking-tight">
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
			const problems = validateBookingDraft(value);
			const failed = Object.keys(problems) as (keyof BookingValues)[];
			for (const name of failed) {
				const message = problems[name];
				if (!message) continue;
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
			}
			if (failed.length > 0) return;

			const payload = buildBookingUpdate(value);
			try {
				await update({
					bookingId: bookingId as Id<"bookings">,
					...payload,
					scheduleId: payload.scheduleId
						? (payload.scheduleId as Id<"tourSchedules">)
						: undefined,
				});
				toast.success("Booking updated");
				void navigate({
					to: "/dashboard/bookings/$bookingId",
					params: { bookingId },
				});
			} catch (err) {
				setSubmitErr(getSafeDisplayMessage(err));
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
				<h1 className="mt-2 font-display text-2xl font-medium tracking-tight">
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
										<BookingDateTimeField
											id="edit-date"
											label="Date"
											type="date"
											binding={bindField(field, (v) => {
												field.handleChange(v);
												form.setFieldValue("scheduleId", "");
											})}
										/>
									)}
								</form.Field>

								{slots.length > 0 ? (
									<form.Field name="scheduleId">
										{(field) => (
											<BookingSlotField
												id="edit-slot"
												label="Schedule slot"
												slots={slots}
												onSelect={(id) => {
													field.handleChange(id);
													const slot = slots.find((s) => s._id === id);
													if (slot) {
														form.setFieldValue("startTime", slot.startTime);
													}
												}}
												binding={bindField(field)}
											/>
										)}
									</form.Field>
								) : (
									<form.Field name="startTime">
										{(field) => (
											<BookingDateTimeField
												id="edit-time"
												label="Start time"
												type="time"
												binding={bindField(field, (v) => {
													field.handleChange(v);
													form.setFieldValue("scheduleId", "");
												})}
											/>
										)}
									</form.Field>
								)}

								<form.Field name="guests">
									{(field) => (
										<BookingNumberField
											id="edit-guests"
											label="Guests"
											min="1"
											required
											binding={bindField(field)}
										/>
									)}
								</form.Field>
							</FieldGroup>

							<form.Field name="guestNames">
								{(field) => (
									<BookingTextField
										id="edit-guest-names"
										label="Guest names"
										placeholder="Jane, John"
										maxLength={MAX_GUEST_NAMES_LEN}
										description="Comma-separated"
										binding={bindField(field)}
									/>
								)}
							</form.Field>

							<form.Field name="languageRequired">
								{(field) => (
									<BookingTextField
										id="edit-lang"
										label="Language required"
										placeholder="en, es, fr"
										maxLength={MAX_SHORT_FIELD_LEN}
										binding={bindField(field)}
									/>
								)}
							</form.Field>

							<form.Field name="notes">
								{(field) => (
									<BookingNotesField
										id="edit-notes"
										label="Notes"
										placeholder="Allergies, special requests…"
										maxLength={MAX_NOTES_LEN}
										counter={`${notesLen} / ${MAX_NOTES_LEN}`}
										binding={bindField(field)}
									/>
								)}
							</form.Field>

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<form.Field name="totalUsd">
									{(field) => (
										<BookingNumberField
											id="edit-total"
											label="Total (USD)"
											min="0"
											step="0.01"
											binding={bindField(field)}
										/>
									)}
								</form.Field>
								<form.Field name="depositUsd">
									{(field) => (
										<BookingNumberField
											id="edit-deposit"
											label="Deposit (USD)"
											min="0"
											step="0.01"
											binding={bindField(field)}
										/>
									)}
								</form.Field>
								<form.Field name="paymentMethod">
									{(field) => (
										<BookingTextField
											id="edit-payment"
											label="Payment method"
											placeholder="card, cash, invoice…"
											maxLength={MAX_PAYMENT_METHOD_LEN}
											binding={bindField(field)}
										/>
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
