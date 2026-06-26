import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "../../../convex/_generated/api";
import { FormActions, FormField } from "../form";

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

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);

		const g = Number(guests);
		if (g <= 0) {
			setError("Guests must be a positive number");
			setPending(false);
			return;
		}

		try {
			const id = await create({
				tourId: tourId as never,
				customerId: customerId as never,
				date,
				startTime,
				guests: g,
				guestNames: guestNames || undefined,
				notes: notes || undefined,
				totalAmountCents:
					totalUsd && Number(totalUsd) > 0
						? BigInt(Math.round(Number(totalUsd) * 100))
						: undefined,
				depositAmountCents:
					depositUsd && Number(depositUsd) > 0
						? BigInt(Math.round(Number(depositUsd) * 100))
						: undefined,
			});
			toast.success("Booking created");
			void navigate({
				to: "/dashboard/bookings/$bookingId",
				params: { bookingId: id },
			});
		} catch (err) {
			setError((err as Error).message);
			toast.error((err as Error).message);
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
							<select
								id="tour"
								required
								value={tourId}
								onChange={(e) => setTourId(e.target.value)}
								className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
							>
								<option value="">Select a tour…</option>
								{(tours ?? []).map((t) => (
									<option key={t._id} value={t._id}>
										{t.name}
									</option>
								))}
							</select>
						</FormField>

						<FormField label="Customer *" htmlFor="customer">
							<select
								id="customer"
								required
								value={customerId}
								onChange={(e) => setCustomerId(e.target.value)}
								className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
							>
								<option value="">Select a customer…</option>
								{(customers?.items ?? []).map((c) => (
									<option key={c._id} value={c._id}>
										{c.name} ({c.email})
									</option>
								))}
							</select>
						</FormField>

						<div className="grid gap-4 md:grid-cols-3">
							<FormField label="Date *" htmlFor="date">
								<Input
									id="date"
									type="date"
									required
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
							<FormField label="Guests *" htmlFor="guests">
								<Input
									id="guests"
									type="number"
									min="1"
									required
									value={guests}
									onChange={(e) => setGuests(e.target.value)}
								/>
							</FormField>
						</div>

						<FormField label="Guest names" htmlFor="gNames">
							<Input
								id="gNames"
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
								/>
							</FormField>
							<FormField label="Deposit (USD)" htmlFor="deposit">
								<Input
									id="deposit"
									type="number"
									step="0.01"
									min="0"
									value={depositUsd}
									onChange={(e) => setDepositUsd(e.target.value)}
								/>
							</FormField>
						</div>

						<FormField label="Notes" htmlFor="notes">
							<textarea
								id="notes"
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								rows={3}
								className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
							/>
						</FormField>

						{error && <p className="text-destructive text-sm">{error}</p>}

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