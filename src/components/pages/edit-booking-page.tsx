import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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

interface FormValues extends Record<string, unknown> {
	date: string;
	startTime: string;
	guests: string;
	guestNames: string;
	languageRequired: string;
	notes: string;
	depositUsd: string;
	totalUsd: string;
	paymentMethod: string;
}

interface EditBookingPageProps {
	bookingId: string;
}

export function EditBookingPage({ bookingId }: EditBookingPageProps) {
	const booking = useQuery(api.bookings.get, {
		bookingId: bookingId as Id<"bookings">,
	});
	const update = useMutation(api.bookings.update);
	const [loaded, setLoaded] = useState(false);
	const [guestsErr, setGuestsErr] = useState<string | null>(null);
	const [notesErr, setNotesErr] = useState<string | null>(null);
	const [depositErr, setDepositErr] = useState<string | null>(null);

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const guestsError = validatePositiveInteger(v.guests, "Guests");
			setGuestsErr(guestsError);
			const notesError = validateNotesOptional(v.notes);
			setNotesErr(notesError);

			const totalCents = v.totalUsd.trim() ? parseUsdToCents(v.totalUsd) : null;
			if (v.totalUsd.trim() && totalCents === null) {
				throw new Error("Total amount must be a non-negative number");
			}
			const depositCents = v.depositUsd.trim()
				? parseUsdToCents(v.depositUsd)
				: null;
			if (v.depositUsd.trim() && depositCents === null) {
				setDepositErr("Deposit must be a non-negative number");
				throw new Error("Deposit must be a non-negative number");
			}
			if (
				depositCents !== null &&
				totalCents !== null &&
				depositCents > totalCents
			) {
				setDepositErr("Deposit cannot exceed the total amount");
				throw new Error("Deposit cannot exceed the total amount");
			}

			if (guestsError || notesError) {
				throw new Error(guestsError ?? notesError ?? "Invalid input");
			}

			await update({
				bookingId: bookingId as Id<"bookings">,
				date: v.date,
				startTime: v.startTime,
				guests: Number(v.guests),
				guestNames: v.guestNames.trim() || undefined,
				languageRequired: v.languageRequired.trim() || undefined,
				notes: v.notes.trim() || undefined,
				depositAmountCents: depositCents ?? undefined,
				totalAmountCents: totalCents ?? undefined,
				paymentMethod: v.paymentMethod.trim() || undefined,
			});
			return bookingId;
		},
		initialValues: {
			date: "",
			startTime: "",
			guests: "1",
			guestNames: "",
			languageRequired: "",
			notes: "",
			depositUsd: "",
			totalUsd: "",
			paymentMethod: "",
		},
		redirectTo: (id) => `/dashboard/bookings/${id}`,
		successMessage: "Booking updated",
	});

	// Populate form from server data once it loads.
	useEffect(() => {
		if (booking && !loaded) {
			const b = booking as unknown as {
				date: string;
				startTime: string;
				guests: number;
				guestNames: string;
				languageRequired: string;
				notes: string;
				depositAmountCents: bigint | number;
				totalAmountCents: bigint | number;
				paymentMethod: string;
			};
			form.set("date", b.date);
			form.set("startTime", b.startTime);
			form.set("guests", String(b.guests));
			form.set("guestNames", b.guestNames ?? "");
			form.set("languageRequired", b.languageRequired ?? "");
			form.set("notes", b.notes ?? "");
			form.set(
				"depositUsd",
				b.depositAmountCents
					? (Number(b.depositAmountCents) / 100).toFixed(2)
					: "",
			);
			form.set(
				"totalUsd",
				b.totalAmountCents ? (Number(b.totalAmountCents) / 100).toFixed(2) : "",
			);
			form.set("paymentMethod", b.paymentMethod ?? "");
			setLoaded(true);
		}
	}, [booking, loaded, form]);

	if (booking === undefined) {
		return (
			<div className="space-y-4 p-4">
				<Skeleton className="h-8 w-1/3" />
				<Skeleton className="h-4 w-1/2" />
				<Skeleton className="h-32 w-full" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-2/3" />
			</div>
		);
	}
	if (booking === null) {
		return <p className="text-muted-foreground">Booking not found.</p>;
	}

	// Refuse editing of terminal bookings (security guard: state
	// transitions must go through checkIn/complete/cancel).
	const status = (booking as { status: string }).status;
	const isTerminal = status === "completed" || status === "cancelled";
	if (isTerminal) {
		return (
			<div className="mx-auto max-w-2xl space-y-4">
				<header>
					<h1 className="text-2xl font-semibold">Cannot edit booking</h1>
					<p className="text-muted-foreground text-sm">
						This booking is <span className="font-medium">{status}</span> — only
						active bookings (pending / confirmed / checked-in) can be edited.
					</p>
				</header>
			</div>
		);
	}

	return (
		<EntityFormPage
			form={form}
			title="Edit booking"
			description="Update booking details. State changes (check-in, complete, cancel) are handled separately on the booking page."
			backTo={`/dashboard/bookings/${bookingId}`}
			submitLabel="Save changes"
		>
			<div className="grid gap-4 md:grid-cols-3">
				<FormField label="Date" htmlFor="edit-date">
					<Input
						id="edit-date"
						type="date"
						required
						value={form.values.date}
						onChange={(e) => form.set("date", e.target.value)}
					/>
				</FormField>
				<FormField label="Start time" htmlFor="edit-time">
					<Input
						id="edit-time"
						type="time"
						required
						value={form.values.startTime}
						onChange={(e) => form.set("startTime", e.target.value)}
					/>
				</FormField>
				<FormField
					label="Guests"
					htmlFor="edit-guests"
					error={guestsErr ?? undefined}
				>
					<Input
						id="edit-guests"
						type="number"
						min="1"
						required
						value={form.values.guests}
						onChange={(e) => {
							form.set("guests", e.target.value);
							if (guestsErr) setGuestsErr(null);
						}}
					/>
				</FormField>
			</div>

			<FormField
				label="Guest names"
				htmlFor="edit-guest-names"
				hint="Comma-separated"
			>
				<Input
					id="edit-guest-names"
					maxLength={500}
					value={form.values.guestNames}
					onChange={(e) => form.set("guestNames", e.target.value)}
					placeholder="Jane, John"
				/>
			</FormField>

			<FormField label="Language required" htmlFor="edit-lang">
				<Input
					id="edit-lang"
					maxLength={100}
					value={form.values.languageRequired}
					onChange={(e) => form.set("languageRequired", e.target.value)}
					placeholder="en, es, fr"
				/>
			</FormField>

			<FormField
				label="Notes"
				htmlFor="edit-notes"
				error={notesErr ?? undefined}
			>
				<Textarea
					id="edit-notes"
					value={form.values.notes}
					onChange={(e) => {
						form.set("notes", e.target.value);
						if (notesErr) setNotesErr(null);
					}}
					rows={3}
					maxLength={MAX_NOTES_LEN}
					placeholder="Allergies, special requests…"
				/>
				<p className="text-muted-foreground text-xs text-right">
					{form.values.notes.length} / {MAX_NOTES_LEN}
				</p>
			</FormField>

			<div className="grid gap-4 md:grid-cols-3">
				<FormField label="Total (USD)" htmlFor="edit-total">
					<Input
						id="edit-total"
						type="number"
						step="0.01"
						min="0"
						value={form.values.totalUsd}
						onChange={(e) => form.set("totalUsd", e.target.value)}
					/>
				</FormField>
				<FormField
					label="Deposit (USD)"
					htmlFor="edit-deposit"
					error={depositErr ?? undefined}
				>
					<Input
						id="edit-deposit"
						type="number"
						step="0.01"
						min="0"
						value={form.values.depositUsd}
						onChange={(e) => {
							form.set("depositUsd", e.target.value);
							if (depositErr) setDepositErr(null);
						}}
					/>
				</FormField>
				<FormField label="Payment method" htmlFor="edit-payment">
					<Input
						id="edit-payment"
						maxLength={50}
						value={form.values.paymentMethod}
						onChange={(e) => form.set("paymentMethod", e.target.value)}
						placeholder="card, cash, invoice…"
					/>
				</FormField>
			</div>
		</EntityFormPage>
	);
}

// Route declaration lives in src/routes/dashboard/bookings/$bookingId/edit.tsx
// to keep page components decoupled from TanStack Router wiring.
