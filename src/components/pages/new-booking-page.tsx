import { convexQuery } from "@convex-dev/react-query";
import { useForm, useStore } from "@tanstack/react-form";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageBackLink } from "@/components/detail-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/utils";
import {
	MAX_GUEST_NAMES_LEN,
	MAX_NOTES_LEN,
	parseUsdToCents,
	validateNotesOptional,
	validatePositiveInteger,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const bookingNewRoute = getRouteApi("/dashboard/bookings/new");

type TourLite = {
	_id: string;
	name: string;
	maxGuests?: number;
	basePriceCents?: bigint | number;
};

type CustomerLite = {
	_id: string;
	name: string;
	email: string;
};

type ScheduleLite = {
	_id: string;
	date: string;
	startTime: string;
	endTime: string;
	capacityTotal: number;
	capacityBooked: number;
	status: string;
};

type BookingValues = {
	tourId: string;
	customerId: string;
	date: string;
	startTime: string;
	scheduleId: string;
	guests: string;
	guestNames: string;
	notes: string;
	totalUsd: string;
	depositUsd: string;
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

export function NewBookingPage() {
	const navigate = useNavigate();
	const search = bookingNewRoute.useSearch();
	const create = useMutation(api.bookings.create);
	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const [customerQuery, setCustomerQuery] = useState("");
	const [debouncedCustomerQuery] = useDebouncedValue(customerQuery, {
		wait: 200,
		leading: false,
		trailing: true,
	});
	const { data: customers } = useQuery(
		convexQuery(api.customers.list, {
			pageSize: 50,
			search: debouncedCustomerQuery.trim() || undefined,
		}),
	);
	const prefillScheduleId = search.scheduleId as
		| Id<"tourSchedules">
		| undefined;
	const { data: prefillSchedule } = useQuery(
		convexQuery(
			api.tourSchedules.get,
			prefillScheduleId ? { scheduleId: prefillScheduleId } : "skip",
		),
	);
	const [submitErr, setSubmitErr] = useState<string | null>(null);
	const daySlotsRef = useRef<ScheduleLite[]>([]);

	const form = useForm({
		defaultValues: {
			tourId: "",
			customerId: search.customerId ?? "",
			date: "",
			startTime: "10:00",
			scheduleId: "",
			guests: "1",
			guestNames: "",
			notes: "",
			totalUsd: "",
			depositUsd: "",
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

			if (!value.tourId) fail("tourId", "Please select a tour");
			if (!value.customerId) fail("customerId", "Please select a customer");
			if (!value.date) fail("date", "Date is required");
			const slots = daySlotsRef.current;
			if (slots.length > 0 && !value.scheduleId) {
				fail("scheduleId", "Please select a schedule slot");
			} else if (!value.startTime) {
				fail("startTime", "Start time is required");
			}
			const guestsErr = validatePositiveInteger(value.guests, "Guests");
			if (guestsErr) {
				fail("guests", guestsErr);
			} else {
				const tour = ((tours ?? []) as TourLite[]).find(
					(t) => t._id === value.tourId,
				);
				if (tour?.maxGuests && Number(value.guests) > tour.maxGuests) {
					fail("guests", `Tour maximum is ${tour.maxGuests} guests`);
				}
				const slot = slots.find((s) => s._id === value.scheduleId);
				if (slot) {
					const seatsLeft = slot.capacityTotal - slot.capacityBooked;
					if (Number(value.guests) > seatsLeft) {
						fail("guests", `Only ${seatsLeft} seats left on this slot`);
					}
				}
			}
			const notesErr = validateNotesOptional(value.notes);
			if (notesErr) fail("notes", notesErr);
			if (value.guestNames.trim().length > MAX_GUEST_NAMES_LEN) {
				fail(
					"guestNames",
					`Guest names are too long (max ${MAX_GUEST_NAMES_LEN} characters)`,
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
				const id = await create({
					tourId: value.tourId as Id<"tours">,
					customerId: value.customerId as Id<"customers">,
					date: value.date,
					startTime: value.startTime,
					scheduleId: value.scheduleId
						? (value.scheduleId as Id<"tourSchedules">)
						: undefined,
					guests: Number(value.guests),
					guestNames: value.guestNames.trim() || undefined,
					notes: value.notes.trim() || undefined,
					totalAmountCents: totalCents ?? undefined,
					depositAmountCents: depositCents ?? undefined,
				});
				toast.success("Booking created");
				void navigate({
					to: "/dashboard/bookings/$bookingId",
					params: { bookingId: id },
				});
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
			}
		},
	});

	const tourId = useStore(form.store, (s) => s.values.tourId);
	const date = useStore(form.store, (s) => s.values.date);
	const notesLen = useStore(form.store, (s) => s.values.notes.length);

	const { data: daySchedules } = useQuery(
		convexQuery(
			api.tourSchedules.list,
			tourId && date
				? {
						tourId: tourId as Id<"tours">,
						dateFrom: date,
						dateTo: date,
						status: "available",
					}
				: "skip",
		),
	);

	const daySlots = ((daySchedules ?? []) as ScheduleLite[]).filter(
		(s) =>
			s.status === "available" &&
			s.capacityBooked < s.capacityTotal &&
			(!date || s.date === date),
	);
	daySlotsRef.current = daySlots;

	useEffect(() => {
		if (!prefillSchedule) return;
		form.setFieldValue("tourId", String(prefillSchedule.tourId));
		form.setFieldValue("date", prefillSchedule.date);
		form.setFieldValue("startTime", prefillSchedule.startTime);
		form.setFieldValue("scheduleId", String(prefillSchedule._id));
		const tour = ((tours ?? []) as TourLite[]).find(
			(t) => t._id === String(prefillSchedule.tourId),
		);
		if (tour?.basePriceCents !== undefined && !form.getFieldValue("totalUsd")) {
			const cents = Number(tour.basePriceCents);
			form.setFieldValue("totalUsd", (cents / 100).toFixed(2));
		}
	}, [prefillSchedule, tours, form]);

	const currentTour = ((tours ?? []) as TourLite[]).find(
		(t) => t._id === tourId,
	);
	const maxGuests = currentTour?.maxGuests;
	const selectedCustomerId = useStore(form.store, (s) => s.values.customerId);
	const { data: selectedCustomer } = useQuery(
		convexQuery(
			api.customers.get,
			selectedCustomerId
				? { customerId: selectedCustomerId as Id<"customers"> }
				: "skip",
		),
	);
	const listedCustomers = (customers?.items ?? []) as CustomerLite[];
	const customerItems = [
		...(selectedCustomer &&
		!listedCustomers.some((c) => c._id === selectedCustomer._id)
			? [
					{
						_id: selectedCustomer._id,
						name: selectedCustomer.name,
						email: selectedCustomer.email,
					} satisfies CustomerLite,
				]
			: []),
		...listedCustomers,
	];
	const noCustomersOnFile =
		customers !== undefined &&
		!debouncedCustomerQuery.trim() &&
		customers.total === 0;

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<div>
				<PageBackLink to="/dashboard/bookings" />
				<h1 className="mt-2 text-2xl font-semibold tracking-tight">
					New booking
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Walk-up or phone booking for a customer already on file. Attaches to a
					published slot when one exists for that date.
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
							<form.Field name="tourId">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="tour">Tour *</FieldLabel>
										<Select
											value={field.state.value || undefined}
											onValueChange={(v) => {
												field.handleChange(v);
												form.setFieldValue("scheduleId", "");
											}}
										>
											<SelectTrigger id="tour">
												<SelectValue placeholder="Select a tour…" />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{((tours ?? []) as TourLite[]).map((t) => (
														<SelectItem key={t._id} value={t._id}>
															{t.name}
														</SelectItem>
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<form.Field name="customerId">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="customer">Customer *</FieldLabel>
										<Input
											id="customer-search"
											value={customerQuery}
											onChange={(e) => setCustomerQuery(e.target.value)}
											placeholder="Search name, email, or phone…"
											autoComplete="off"
										/>
										<Select
											value={field.state.value || undefined}
											onValueChange={(v) => field.handleChange(v)}
										>
											<SelectTrigger id="customer">
												<SelectValue placeholder="Select a customer…" />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{customerItems.map((c) => (
														<SelectItem key={c._id} value={c._id}>
															{c.name} ({c.email})
														</SelectItem>
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
										<FieldDescription>
											{noCustomersOnFile ? (
												<Link
													to="/dashboard/customers/new"
													className="underline underline-offset-4"
												>
													Add a customer first
												</Link>
											) : customerItems.length === 0 ? (
												"No matches — try a different name or email."
											) : (
												"Must already be in this organization."
											)}
										</FieldDescription>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<form.Field name="date">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="date">Date *</FieldLabel>
											<Input
												id="date"
												type="date"
												required
												min={new Date().toISOString().slice(0, 10)}
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

								{daySlots.length > 0 ? (
									<form.Field name="scheduleId">
										{(field) => (
											<Field data-invalid={!field.state.meta.isValid}>
												<FieldLabel htmlFor="slot">Schedule slot *</FieldLabel>
												<Select
													value={field.state.value || undefined}
													onValueChange={(id) => {
														field.handleChange(id);
														const slot = daySlots.find((s) => s._id === id);
														if (slot) {
															form.setFieldValue("startTime", slot.startTime);
															form.setFieldValue("date", slot.date);
														}
													}}
												>
													<SelectTrigger id="slot">
														<SelectValue placeholder="Select a time…" />
													</SelectTrigger>
													<SelectContent>
														<SelectGroup>
															{daySlots.map((s) => (
																<SelectItem key={s._id} value={s._id}>
																	{s.startTime}
																	{s.endTime ? `–${s.endTime}` : ""} ·{" "}
																	{s.capacityTotal - s.capacityBooked} left
																</SelectItem>
															))}
														</SelectGroup>
													</SelectContent>
												</Select>
												<FieldDescription>
													Links capacity on the published departure.
												</FieldDescription>
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
												<FieldLabel htmlFor="time">Start time *</FieldLabel>
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
											<FieldLabel htmlFor="guests">Guests *</FieldLabel>
											<Input
												id="guests"
												type="number"
												min="1"
												max={maxGuests ?? undefined}
												required
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={!field.state.meta.isValid}
											/>
											{maxGuests ? (
												<FieldDescription>
													Max {maxGuests} guests
												</FieldDescription>
											) : null}
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							{tourId && date && daySlots.length === 0 ? (
								<Alert>
									<AlertTitle>No published slot for this date</AlertTitle>
									<AlertDescription>
										This booking will use the free-form start time. Capacity
										still attaches if a matching schedule exists.
									</AlertDescription>
								</Alert>
							) : null}

							<form.Field name="guestNames">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="gNames">Guest names</FieldLabel>
										<Input
											id="gNames"
											maxLength={MAX_GUEST_NAMES_LEN}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="Jane, John, …"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldDescription>
											Comma-separated, one per guest.
										</FieldDescription>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<form.Field name="totalUsd">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="total">
												Total amount (USD)
											</FieldLabel>
											<Input
												id="total"
												type="number"
												step="0.01"
												min="0"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="0.00"
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldDescription>
												Per booking, in dollars
											</FieldDescription>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="depositUsd">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="deposit">Deposit (USD)</FieldLabel>
											<Input
												id="deposit"
												type="number"
												step="0.01"
												min="0"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="0.00"
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							<form.Field name="notes">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="notes">Notes</FieldLabel>
										<Textarea
											id="notes"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											rows={3}
											maxLength={MAX_NOTES_LEN}
											placeholder="Optional"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldDescription>
											{notesLen} / {MAX_NOTES_LEN}
										</FieldDescription>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							{submitErr ? <ErrorBanner message={submitErr} /> : null}

							<form.Subscribe
								selector={(state) =>
									[state.canSubmit, state.isSubmitting] as const
								}
							>
								{([canSubmit, isSubmitting]) => (
									<div className="flex justify-end gap-2 pt-2">
										<Button type="button" variant="outline" asChild>
											<Link to="/dashboard/bookings">Back</Link>
										</Button>
										<Button type="submit" disabled={!canSubmit || isSubmitting}>
											{isSubmitting ? (
												<Spinner data-icon="inline-start" />
											) : null}
											{isSubmitting ? "Saving…" : "Create booking"}
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
