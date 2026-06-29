import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/utils";
import {
	MAX_NOTES_LEN,
	parseUsdToCents,
	validateNotesOptional,
	validatePositiveInteger,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FormActions, FormField } from "../form";

interface TourLite {
	_id: string;
	name: string;
	maxGuests?: number;
}
interface CustomerLite {
	_id: string;
	name: string;
	email: string;
}

export function NewBookingPage() {
	const navigate = useNavigate();
	const create = useMutation(api.bookings.create);
	const tours = useQuery(api.tours.list, {});
	const customers = useQuery(api.customers.list, {});

	const [tourId, setTourId] = useState("");
	const [customerId, setCustomerId] = useState("");
	const [date, setDate] = useState("");
	const [startTime, setStartTime] = useState("10:00");
	const [guests, setGuests] = useState("1");
	const [guestNames, setGuestNames] = useState("");
	const [notes, setNotes] = useState("");
	const [totalUsd, setTotalUsd] = useState("");
	const [depositUsd, setDepositUsd] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [guestsErr, setGuestsErr] = useState<string | null>(null);
	const [notesErr, setNotesErr] = useState<string | null>(null);
	const [depositErr, setDepositErr] = useState<string | null>(null);

	const selectedTour = ((tours ?? []) as TourLite[]).find(
		(t) => t._id === tourId,
	);
	const maxGuests = selectedTour?.maxGuests;

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (!tourId) {
			setError("Please select a tour");
			return;
		}
		if (!customerId) {
			setError("Please select a customer");
			return;
		}
		const guestsError = validatePositiveInteger(guests, "Guests");
		let capError: string | null = null;
		if (maxGuests && Number(guests) > maxGuests) {
			capError = `Tour maximum is ${maxGuests} guests`;
		}
		setGuestsErr(guestsError ?? capError);
		const notesError = validateNotesOptional(notes);
		setNotesErr(notesError);

		const totalCents = totalUsd.trim() ? parseUsdToCents(totalUsd) : null;
		if (totalUsd.trim() && totalCents === null) {
			setError("Total amount must be a non-negative number");
			return;
		}
		const depositCents = depositUsd.trim() ? parseUsdToCents(depositUsd) : null;
		if (depositUsd.trim() && depositCents === null) {
			setDepositErr("Deposit must be a non-negative number");
			return;
		}
		if (
			depositCents !== null &&
			totalCents !== null &&
			depositCents > totalCents
		) {
			setDepositErr("Deposit cannot exceed the total amount");
			return;
		}

		if (guestsError || capError || notesError) {
			setError(guestsError ?? capError ?? notesError ?? "Invalid input");
			return;
		}

		setPending(true);
		try {
			const id = await create({
				tourId: tourId as Id<"tours">,
				customerId: customerId as Id<"customers">,
				date,
				startTime,
				guests: Number(guests),
				guestNames: guestNames.trim() || undefined,
				notes: notes.trim() || undefined,
				totalAmountCents: totalCents ?? undefined,
				depositAmountCents: depositCents ?? undefined,
			});
			void navigate({
				to: "/dashboard/bookings/$bookingId",
				params: { bookingId: id },
			});
		} catch (err) {
			setError(getErrorMessage(err));
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="mx-auto max-w-2xl">
			<Card>
				<CardHeader>
					<CardTitle>New booking</CardTitle>
					<CardDescription>
						Create a booking for an existing customer on an existing tour
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="space-y-4">
						<FormField label="Tour *" htmlFor="tour">
							<Select value={tourId} onValueChange={setTourId}>
								<SelectTrigger id="tour">
									<SelectValue placeholder="Select a tour…" />
								</SelectTrigger>
								<SelectContent>
									{((tours ?? []) as TourLite[]).map((t) => (
										<SelectItem key={t._id} value={t._id}>
											{t.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FormField>

						<FormField label="Customer *" htmlFor="customer">
							<Select value={customerId} onValueChange={setCustomerId}>
								<SelectTrigger id="customer">
									<SelectValue placeholder="Select a customer…" />
								</SelectTrigger>
								<SelectContent>
									{((customers?.items ?? []) as CustomerLite[]).map((c) => (
										<SelectItem key={c._id} value={c._id}>
											{c.name} ({c.email})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FormField>

						<div className="grid gap-4 md:grid-cols-3">
							<FormField label="Date *" htmlFor="date">
								<Input
									id="date"
									type="date"
									required
									min={new Date().toISOString().slice(0, 10)}
									value={date}
									onChange={(e) => setDate(e.target.value)}
								/>
							</FormField>
							<FormField label="Start time *" htmlFor="time">
								<Input
									id="time"
									type="time"
									required
									value={startTime}
									onChange={(e) => setStartTime(e.target.value)}
								/>
							</FormField>
							<FormField
								label="Guests *"
								htmlFor="guests"
								error={guestsErr ?? undefined}
								hint={maxGuests ? `Max ${maxGuests} guests` : undefined}
							>
								<Input
									id="guests"
									type="number"
									min="1"
									max={maxGuests ?? undefined}
									required
									value={guests}
									onChange={(e) => {
										setGuests(e.target.value);
										if (guestsErr) setGuestsErr(null);
									}}
								/>
							</FormField>
						</div>

						<FormField
							label="Guest names"
							htmlFor="gNames"
							hint="Comma-separated, one per guest"
						>
							<Input
								id="gNames"
								maxLength={500}
								value={guestNames}
								onChange={(e) => setGuestNames(e.target.value)}
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
									value={totalUsd}
									onChange={(e) => setTotalUsd(e.target.value)}
									placeholder="0.00"
								/>
							</FormField>
							<FormField
								label="Deposit (USD)"
								htmlFor="deposit"
								error={depositErr ?? undefined}
							>
								<Input
									id="deposit"
									type="number"
									step="0.01"
									min="0"
									value={depositUsd}
									onChange={(e) => {
										setDepositUsd(e.target.value);
										if (depositErr) setDepositErr(null);
									}}
									placeholder="0.00"
								/>
							</FormField>
						</div>

						<FormField
							label="Notes"
							htmlFor="notes"
							error={notesErr ?? undefined}
						>
							<Textarea
								id="notes"
								value={notes}
								onChange={(e) => {
									setNotes(e.target.value);
									if (notesErr) setNotesErr(null);
								}}
								rows={3}
								maxLength={MAX_NOTES_LEN}
								placeholder="Optional"
							/>
							<p className="text-muted-foreground text-xs text-right">
								{notes.length} / {MAX_NOTES_LEN}
							</p>
						</FormField>

						{error && (
							<div
								className="rounded-md border border-destructive/50 bg-destructive/10 p-3"
								role="alert"
							>
								<p className="text-destructive text-sm font-medium">{error}</p>
							</div>
						)}

						<FormActions
							onCancel={() => navigate({ to: "/dashboard/bookings" })}
							pending={pending}
							submitLabel="Create booking"
						/>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
