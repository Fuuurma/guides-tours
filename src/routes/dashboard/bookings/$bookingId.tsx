import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/bookings/$bookingId")({
	component: BookingDetailPage,
});

const statusColors: Record<string, string> = {
	pending: "bg-yellow-100 text-yellow-800",
	confirmed: "bg-green-100 text-green-800",
	checked_in: "bg-blue-100 text-blue-800",
	completed: "bg-gray-100 text-gray-800",
	cancelled: "bg-red-100 text-red-800",
};

function BookingDetailPage() {
	const { bookingId } = Route.useParams();
	const { data: booking, isPending, error } = useQuery(
		convexQuery(api.bookings.get, { bookingId: bookingId as never }),
	);
	const checkIn = useMutation(api.bookings.checkIn);
	const complete = useMutation(api.bookings.complete);
	const cancelBooking = useMutation(api.bookings.cancel);
	const [pending, setPending] = useState(false);
	const [showCancelForm, setShowCancelForm] = useState(false);
	const [cancelReason, setCancelReason] = useState("");

	const runAction = async (fn: () => Promise<unknown>, msg: string) => {
		setPending(true);
		try {
			await fn();
			toast.success(msg);
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setPending(false);
		}
	};

	const onCheckIn = () =>
		runAction(
			() => checkIn({ bookingId: bookingId as never }),
			"Customer checked in",
		);
	const onComplete = () =>
		runAction(
			() => complete({ bookingId: bookingId as never }),
			"Booking completed",
		);
	const onCancel = () => {
		if (!cancelReason.trim()) {
			toast.error("Please provide a reason");
			return;
		}
		runAction(
			() =>
				cancelBooking({
					bookingId: bookingId as never,
					reason: cancelReason,
				}),
			"Booking cancelled",
		).then(() => {
			setShowCancelForm(false);
			setCancelReason("");
		});
	};

	if (isPending) return <p className="text-muted-foreground">Loading...</p>;
	if (error)
		return (
			<p className="text-destructive text-sm">Error: {error.message}</p>
		);
	if (!booking) {
		return (
			<div className="space-y-4">
				<p className="text-muted-foreground">Booking not found.</p>
				<Button asChild variant="outline">
					<Link to="/dashboard/bookings">← Back to bookings</Link>
				</Button>
			</div>
		);
	}

	const b = booking as unknown as {
		_id: string;
		date: string;
		startTime: string;
		guests: number;
		status: keyof typeof statusColors;
		source: string;
		totalAmountCents: number;
		depositAmountCents: number;
		balanceDueCents: number;
		netRevenueCents: number;
		paymentMethod: string;
		guestNames: string;
		notes: string;
		reviewRating: number | null;
		reviewComment: string;
		checkedInAt: number | null;
		checkedInBy: string;
		completedAt: number | null;
		tour: { _id: string; name: string } | null;
		customer: { _id: string; name: string; email: string } | null;
	};

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Booking {b._id.slice(-8)}</h1>
					<p className="text-muted-foreground text-sm">
						{b.date} at {b.startTime} · {b.guests} guests
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Badge className={statusColors[b.status] ?? ""} variant="secondary">
						{b.status}
					</Badge>
					{b.status === "confirmed" && (
						<Button onClick={onCheckIn} disabled={pending}>
							Check in
						</Button>
					)}
					{b.status === "checked_in" && (
						<Button onClick={onComplete} disabled={pending}>
							Mark complete
						</Button>
					)}
					{(b.status === "pending" ||
						b.status === "confirmed" ||
						b.status === "checked_in") && (
						<Button
							variant="destructive"
							onClick={() => setShowCancelForm(true)}
							disabled={pending}
						>
							Cancel
						</Button>
					)}
					<Button asChild variant="outline">
						<Link to="/dashboard/bookings">← Back</Link>
					</Button>
				</div>
			</header>

			{showCancelForm && (
				<Card>
					<CardHeader>
						<CardTitle>Cancel booking</CardTitle>
						<CardDescription>
							Provide a reason — this will be recorded in the audit log.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<Input
							value={cancelReason}
							onChange={(e) => setCancelReason(e.target.value)}
							placeholder="Reason for cancellation"
						/>
						<div className="flex gap-2">
							<Button
								variant="destructive"
								onClick={onCancel}
								disabled={pending}
							>
								{pending ? "Cancelling…" : "Confirm cancellation"}
							</Button>
							<Button
								variant="outline"
								onClick={() => {
									setShowCancelForm(false);
									setCancelReason("");
								}}
							>
								Keep booking
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Metric
					label="Total"
					value={`$${(Number(b.totalAmountCents) / 100).toFixed(2)}`}
				/>
				<Metric
					label="Deposit"
					value={`$${(Number(b.depositAmountCents) / 100).toFixed(2)}`}
				/>
				<Metric
					label="Balance due"
					value={`$${(Number(b.balanceDueCents) / 100).toFixed(2)}`}
				/>
				<Metric
					label="Net revenue"
					value={`$${(Number(b.netRevenueCents) / 100).toFixed(2)}`}
				/>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Tour</CardTitle>
						<CardDescription>Booked experience</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 text-sm">
						{b.tour ? (
							<>
								<p className="font-medium">{b.tour.name}</p>
								<Link
									to="/dashboard/tours/$tourId"
									params={{ tourId: b.tour._id }}
									className="text-blue-600 hover:underline text-xs"
								>
									View tour →
								</Link>
							</>
						) : (
							<p className="text-muted-foreground">(deleted)</p>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Customer</CardTitle>
						<CardDescription>Who is attending</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 text-sm">
						{b.customer ? (
							<>
								<p className="font-medium">{b.customer.name}</p>
								<p className="text-muted-foreground">{b.customer.email}</p>
								<Link
									to="/dashboard/customers/$customerId"
									params={{ customerId: b.customer._id }}
									className="text-blue-600 hover:underline text-xs"
								>
									View customer →
								</Link>
							</>
						) : (
							<p className="text-muted-foreground">(deleted)</p>
						)}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Booking details</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<Row label="Source" value={b.source} />
					<Row label="Payment method" value={b.paymentMethod || "(none)"} />
					<Row label="Guest names" value={b.guestNames || "(none)"} />
					<Row label="Notes" value={b.notes || "(none)"} />
					<Row
						label="Checked in"
						value={
							b.checkedInAt
								? `${new Date(b.checkedInAt).toLocaleString()} by ${b.checkedInBy || "unknown"}`
								: "(not checked in)"
						}
					/>
					<Row
						label="Completed at"
						value={b.completedAt ? new Date(b.completedAt).toLocaleString() : "(not completed)"}
					/>
				</CardContent>
			</Card>

			{(b.reviewRating || b.reviewComment) && (
				<Card>
					<CardHeader>
						<CardTitle>Customer review</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2 text-sm">
						{b.reviewRating && (
							<p className="text-2xl font-semibold">
								{"★".repeat(b.reviewRating)}
								<span className="text-muted-foreground">
									{"☆".repeat(5 - b.reviewRating)}
								</span>
							</p>
						)}
						{b.reviewComment && <p>{b.reviewComment}</p>}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardDescription>{label}</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="text-2xl font-semibold">{value}</p>
			</CardContent>
		</Card>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<span className="text-muted-foreground">{label}</span>
			<span>{value}</span>
		</div>
	);
}