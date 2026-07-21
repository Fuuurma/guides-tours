import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	MAX_NOTES_LEN,
	parseUsdToCents,
	validateNotesOptional,
	validatePositiveInteger,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FormField } from "../form";

const bookingNewRoute = getRouteApi("/dashboard/bookings/new");

interface TourLite {
	_id: string;
	name: string;
	maxGuests?: number;
	basePriceCents?: bigint | number;
}
interface CustomerLite {
	_id: string;
	name: string;
	email: string;
}
interface ScheduleLite {
	_id: string;
	date: string;
	startTime: string;
	endTime: string;
	capacityTotal: number;
	capacityBooked: number;
	status: string;
	tourId: string;
}

interface FormValues extends Record<string, unknown> {
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
}

export function NewBookingPage() {
	const search = bookingNewRoute.useSearch();
	const create = useMutation(api.bookings.create);
	const tours = useQuery(convexQuery(api.tours.list, {}));
	const customers = useQuery(convexQuery(api.customers.list, {}));
	const prefillScheduleId = search.scheduleId as
		| Id<"tourSchedules">
		| undefined;
	const { data: prefillSchedule } = useQuery(
		convexQuery(
			api.tourSchedules.get,
			prefillScheduleId ? { scheduleId: prefillScheduleId } : "skip",
		),
	);

	const daySlotsRef = useRef<ScheduleLite[]>([]);

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const totalCents = v.totalUsd.trim() ? parseUsdToCents(v.totalUsd) : null;
			if (v.totalUsd.trim() && totalCents === null) {
				throw new Error("Total amount must be a non-negative number");
			}
			const depositCents = v.depositUsd.trim()
				? parseUsdToCents(v.depositUsd)
				: null;
			if (v.depositUsd.trim() && depositCents === null) {
				throw new Error("Deposit must be a non-negative number");
			}
			if (
				depositCents !== null &&
				totalCents !== null &&
				depositCents > totalCents
			) {
				throw new Error("Deposit cannot exceed the total amount");
			}

			const slots = daySlotsRef.current;
			if (slots.length > 0 && !v.scheduleId) {
				throw new Error("Please select a schedule slot");
			}

			const id = await create({
				tourId: v.tourId as Id<"tours">,
				customerId: v.customerId as Id<"customers">,
				date: v.date,
				startTime: v.startTime,
				scheduleId: v.scheduleId
					? (v.scheduleId as Id<"tourSchedules">)
					: undefined,
				guests: Number(v.guests),
				guestNames: v.guestNames.trim() || undefined,
				notes: v.notes.trim() || undefined,
				totalAmountCents: totalCents ?? undefined,
				depositAmountCents: depositCents ?? undefined,
			});
			return id;
		},
		validate: (v) => {
			const errs: Record<string, string> = {};
			const slots = daySlotsRef.current;
			if (!v.tourId) errs.tourId = "Please select a tour";
			if (!v.customerId) errs.customerId = "Please select a customer";
			if (!v.date) errs.date = "Date is required";
			if (!v.startTime) errs.startTime = "Start time is required";
			if (slots.length > 0 && !v.scheduleId) {
				errs.startTime = "Please select a schedule slot";
			}
			const guestsErr = validatePositiveInteger(v.guests, "Guests");
			if (guestsErr) {
				errs.guests = guestsErr;
			} else {
				const tour = ((tours.data ?? []) as TourLite[]).find(
					(t) => t._id === v.tourId,
				);
				if (tour?.maxGuests && Number(v.guests) > tour.maxGuests) {
					errs.guests = `Tour maximum is ${tour.maxGuests} guests`;
				}
				const slot = slots.find((s) => s._id === v.scheduleId);
				if (slot) {
					const seatsLeft = slot.capacityTotal - slot.capacityBooked;
					if (Number(v.guests) > seatsLeft) {
						errs.guests = `Only ${seatsLeft} seats left on this slot`;
					}
				}
			}
			const notesErr = validateNotesOptional(v.notes);
			if (notesErr) errs.notes = notesErr;
			if (v.depositUsd.trim()) {
				const depositCents = parseUsdToCents(v.depositUsd);
				if (depositCents === null) {
					errs.depositUsd = "Deposit must be a non-negative number";
				} else if (v.totalUsd.trim()) {
					const totalCents = parseUsdToCents(v.totalUsd);
					if (totalCents !== null && depositCents > totalCents) {
						errs.depositUsd = "Deposit cannot exceed the total amount";
					}
				}
			}
			return Object.keys(errs).length > 0 ? errs : null;
		},
		initialValues: {
			tourId: "",
			customerId: "",
			date: "",
			startTime: "10:00",
			scheduleId: "",
			guests: "1",
			guestNames: "",
			notes: "",
			totalUsd: "",
			depositUsd: "",
		},
		redirectTo: (id) => `/dashboard/bookings/${id}`,
		successMessage: "Booking created",
	});

	// Prefill from ?scheduleId=
	useEffect(() => {
		if (!prefillSchedule) return;
		form.set("tourId", String(prefillSchedule.tourId));
		form.set("date", prefillSchedule.date);
		form.set("startTime", prefillSchedule.startTime);
		form.set("scheduleId", String(prefillSchedule._id));
		const tour = ((tours.data ?? []) as TourLite[]).find(
			(t) => t._id === String(prefillSchedule.tourId),
		);
		if (tour?.basePriceCents !== undefined && !form.values.totalUsd) {
			const cents = Number(tour.basePriceCents);
			form.set("totalUsd", (cents / 100).toFixed(2));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot prefill
	}, [prefillSchedule, tours.data, form.values.totalUsd, form.set]);

	const daySchedulesQuery = useQuery(
		convexQuery(
			api.tourSchedules.list,
			form.values.tourId && form.values.date
				? {
						tourId: form.values.tourId as Id<"tours">,
						dateFrom: form.values.date,
						dateTo: form.values.date,
						status: "available",
					}
				: "skip",
		),
	);

	const daySlots = ((daySchedulesQuery.data ?? []) as ScheduleLite[]).filter(
		(s) =>
			s.status === "available" &&
			s.capacityBooked < s.capacityTotal &&
			(!form.values.date || s.date === form.values.date),
	);
	daySlotsRef.current = daySlots;

	const currentTour = ((tours.data ?? []) as TourLite[]).find(
		(t) => t._id === form.values.tourId,
	);
	const maxGuests = currentTour?.maxGuests;

	return (
		<EntityFormPage
			form={form}
			title="New booking"
			description="Create a booking for an existing customer on an existing tour"
			backTo="/dashboard/bookings"
			submitLabel="Create booking"
		>
			<FormField label="Tour *" htmlFor="tour" error={form.fieldErrors.tourId}>
				<Select
					value={form.values.tourId}
					onValueChange={(v) => {
						form.set("tourId", v);
						form.set("scheduleId", "");
					}}
				>
					<SelectTrigger id="tour">
						<SelectValue placeholder="Select a tour…" />
					</SelectTrigger>
					<SelectContent>
						{((tours.data ?? []) as TourLite[]).map((t) => (
							<SelectItem key={t._id} value={t._id}>
								{t.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</FormField>

			<FormField
				label="Customer *"
				htmlFor="customer"
				error={form.fieldErrors.customerId}
			>
				<Select
					value={form.values.customerId}
					onValueChange={(v) => form.set("customerId", v)}
				>
					<SelectTrigger id="customer">
						<SelectValue placeholder="Select a customer…" />
					</SelectTrigger>
					<SelectContent>
						{((customers.data?.items ?? []) as CustomerLite[]).map((c) => (
							<SelectItem key={c._id} value={c._id}>
								{c.name} ({c.email})
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</FormField>

			<div className="grid gap-4 md:grid-cols-3">
				<FormField label="Date *" htmlFor="date" error={form.fieldErrors.date}>
					<Input
						id="date"
						type="date"
						required
						min={new Date().toISOString().slice(0, 10)}
						value={form.values.date}
						onChange={(e) => {
							form.set("date", e.target.value);
							form.set("scheduleId", "");
						}}
					/>
				</FormField>
				{daySlots.length > 0 ? (
					<FormField
						label="Schedule slot *"
						htmlFor="slot"
						error={form.fieldErrors.startTime}
						hint="Links capacity on the schedule"
					>
						<Select
							value={form.values.scheduleId}
							onValueChange={(id) => {
								form.set("scheduleId", id);
								const slot = daySlots.find((s) => s._id === id);
								if (slot) {
									form.set("startTime", slot.startTime);
									form.set("date", slot.date);
								}
							}}
						>
							<SelectTrigger id="slot">
								<SelectValue placeholder="Select a time…" />
							</SelectTrigger>
							<SelectContent>
								{daySlots.map((s) => (
									<SelectItem key={s._id} value={s._id}>
										{s.startTime}
										{s.endTime ? `–${s.endTime}` : ""} ·{" "}
										{s.capacityTotal - s.capacityBooked} left
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FormField>
				) : (
					<FormField
						label="Start time *"
						htmlFor="time"
						error={form.fieldErrors.startTime}
					>
						<Input
							id="time"
							type="time"
							required
							value={form.values.startTime}
							onChange={(e) => {
								form.set("startTime", e.target.value);
								form.set("scheduleId", "");
							}}
						/>
					</FormField>
				)}
				<FormField
					label="Guests *"
					htmlFor="guests"
					error={form.fieldErrors.guests}
					hint={maxGuests ? `Max ${maxGuests} guests` : undefined}
				>
					<Input
						id="guests"
						type="number"
						min="1"
						max={maxGuests ?? undefined}
						required
						value={form.values.guests}
						onChange={(e) => form.set("guests", e.target.value)}
					/>
				</FormField>
			</div>

			{form.values.tourId && form.values.date && daySlots.length === 0 && (
				<p className="text-muted-foreground text-xs">
					No published available slots for this date — booking will use the
					free-form time (capacity still attaches if a matching schedule
					exists).
				</p>
			)}

			<FormField
				label="Guest names"
				htmlFor="gNames"
				hint="Comma-separated, one per guest"
			>
				<Input
					id="gNames"
					maxLength={500}
					value={form.values.guestNames}
					onChange={(e) => form.set("guestNames", e.target.value)}
					placeholder="Jane, John, …"
				/>
			</FormField>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField
					label="Total amount (USD)"
					hint="Per booking, in dollars"
					htmlFor="total"
				>
					<Input
						id="total"
						type="number"
						step="0.01"
						min="0"
						value={form.values.totalUsd}
						onChange={(e) => form.set("totalUsd", e.target.value)}
						placeholder="0.00"
					/>
				</FormField>
				<FormField
					label="Deposit (USD)"
					htmlFor="deposit"
					error={form.fieldErrors.depositUsd}
				>
					<Input
						id="deposit"
						type="number"
						step="0.01"
						min="0"
						value={form.values.depositUsd}
						onChange={(e) => form.set("depositUsd", e.target.value)}
						placeholder="0.00"
					/>
				</FormField>
			</div>

			<FormField label="Notes" htmlFor="notes" error={form.fieldErrors.notes}>
				<Textarea
					id="notes"
					value={form.values.notes}
					onChange={(e) => form.set("notes", e.target.value)}
					rows={3}
					maxLength={MAX_NOTES_LEN}
					placeholder="Optional"
				/>
				<p className="text-muted-foreground text-xs text-right">
					{form.values.notes.length} / {MAX_NOTES_LEN}
				</p>
			</FormField>
		</EntityFormPage>
	);
}
