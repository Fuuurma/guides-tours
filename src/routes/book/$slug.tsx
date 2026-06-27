import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../../convex/_generated/api";

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

	const [selectedTourId, setSelectedTourId] = useState<string>("");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [date, setDate] = useState("");
	const [startTime, setStartTime] = useState("");
	const [guests, setGuests] = useState("1");
	const [notes, setNotes] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [confirmation, setConfirmation] = useState<string | null>(null);

	if (isPending) {
		return (
			<main className="mx-auto max-w-2xl px-4 py-12">
				<p className="text-muted-foreground">Loading…</p>
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
							The link you followed is invalid. Please check the URL or
							contact the tour operator.
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

		const guestCount = Number(guests);
		if (!selectedTourId) {
			toast.error("Please select a tour");
			setSubmitting(false);
			return;
		}
		if (guestCount <= 0) {
			toast.error("Guests must be at least 1");
			setSubmitting(false);
			return;
		}

		try {
			const res = await fetch(`/api/public/book/${slug}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					tourId: selectedTourId,
					customerName: name,
					customerEmail: email,
					customerPhone: phone || undefined,
					date,
					startTime,
					guests: guestCount,
					notes: notes || undefined,
				}),
			});
			const body = (await res.json()) as
				| { bookingId: string; status: string }
				| { error: string };
			if (!res.ok) {
				toast.error(("error" in body && body.error) || "Booking failed");
				return;
			}
			if ("bookingId" in body) {
				setConfirmation(body.bookingId);
				toast.success("Booking confirmed!");
			}
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setSubmitting(false);
		}
	};

	if (confirmation) {
		return (
			<main className="mx-auto max-w-2xl px-4 py-12">
				<Card>
					<CardHeader>
						<CardTitle>Booking confirmed</CardTitle>
						<CardDescription>
							Thank you for booking with {data.organizationName}. We've sent a
							confirmation to {email}.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm">
							Reference:{" "}
							<span className="font-mono text-xs">{confirmation}</span>
						</p>
					</CardContent>
				</Card>
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
					<Card>
						<CardHeader>
							<CardTitle>1. Choose a tour</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
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
											onChange={(e) => setSelectedTourId(e.target.value)}
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

					<Card>
						<CardHeader>
							<CardTitle>2. Pick a date and time</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-1">
									<label
										htmlFor="date"
										className="text-sm font-medium"
									>
										Date *
									</label>
									<Input
										id="date"
										type="date"
										required
										value={date}
										onChange={(e) => setDate(e.target.value)}
									/>
								</div>
								<div className="space-y-1">
									<label
										htmlFor="time"
										className="text-sm font-medium"
									>
										Start time *
									</label>
									<Input
										id="time"
										type="time"
										required
										value={startTime}
										onChange={(e) => setStartTime(e.target.value)}
									/>
								</div>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="guests"
									className="text-sm font-medium"
								>
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
								/>
								{selectedTour && (
									<p className="text-muted-foreground text-xs">
										Max {selectedTour.maxGuests} guests
									</p>
								)}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>3. Your details</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-1">
								<label
									htmlFor="name"
									className="text-sm font-medium"
								>
									Full name *
								</label>
								<Input
									id="name"
									required
									value={name}
									onChange={(e) => setName(e.target.value)}
								/>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="email"
									className="text-sm font-medium"
								>
									Email *
								</label>
								<Input
									id="email"
									type="email"
									required
									value={email}
									onChange={(e) => setEmail(e.target.value)}
								/>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="phone"
									className="text-sm font-medium"
								>
									Phone (optional)
								</label>
								<Input
									id="phone"
									type="tel"
									value={phone}
									onChange={(e) => setPhone(e.target.value)}
								/>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="notes"
									className="text-sm font-medium"
								>
									Special requests (optional)
								</label>
								<Textarea
									id="notes"
									value={notes}
									onChange={(e) => setNotes(e.target.value)}
									rows={3}
									placeholder="Allergies, accessibility needs, etc."
								/>
							</div>
						</CardContent>
						<CardFooter className="flex flex-col gap-3">
							<Button
								type="submit"
								disabled={submitting}
								className="w-full"
							>
								{submitting ? "Booking…" : "Confirm booking"}
							</Button>
							<p className="text-muted-foreground text-xs text-center">
								By booking you agree to the operator's cancellation policy.
							</p>
						</CardFooter>
					</Card>
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
