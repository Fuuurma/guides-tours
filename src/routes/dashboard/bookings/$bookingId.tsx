import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/bookings/$bookingId")({
	component: BookingDetailPage,
});

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
		runAction(() => checkIn({ bookingId: bookingId as never }), "Customer checked in");
	const onComplete = () =>
		runAction(() => complete({ bookingId: bookingId as never }), "Booking completed");
	const onCancel = () => {
		if (!cancelReason.trim()) {
			toast.error("Please provide a reason");
			return;
		}
		runAction(
			() => cancelBooking({ bookingId: bookingId as never, reason: cancelReason }),
			"Booking cancelled",
		).then(() => {
			setShowCancelForm(false);
			setCancelReason("");
		});
	};

	if (isPending) return <p className="text-muted-foreground">Loading...</p>;
	if (error) return <p className="text-destructive text-sm">Error: {error.message}</p>;
	if (!booking) {
		return <DetailPage title="Booking not found" backTo="/dashboard/bookings" />;
	}

	const b = booking as unknown as {
		_id: string;
		date: string;
		startTime: string;
		guests: number;
		status: string;
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
		<DetailPage
			title={`Booking ${b._id.slice(-8)}`}
			subtitle={`${b.date} at ${b.startTime} · ${b.guests} guests`}
			backTo="/dashboard/bookings"
			actions={
				<>
					<StatusBadge status={b.status} />
					{b.status === "confirmed" && (
						<Button onClick={onCheckIn} disabled={pending}>Check in</Button>
					)}
					{b.status === "checked_in" && (
						<Button onClick={onComplete} disabled={pending}>Mark complete</Button>
					)}
					{["pending", "confirmed", "checked_in"].includes(b.status) && (
						<Button variant="destructive" onClick={() => setShowCancelForm(true)} disabled={pending}>Cancel</Button>
					)}
				</>
			}
		>
			{showCancelForm && (
				<div className="rounded-md border p-4 space-y-4">
					<p className="text-sm font-medium">Cancel booking — this will be recorded in the audit log.</p>
					<Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancellation" />
					<div className="flex gap-2">
						<Button variant="destructive" onClick={onCancel} disabled={pending}>
							{pending ? "Cancelling…" : "Confirm cancellation"}
						</Button>
						<Button variant="outline" onClick={() => { setShowCancelForm(false); setCancelReason(""); }}>
							Keep booking
						</Button>
					</div>
				</div>
			)}

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="Total" value={`$${(Number(b.totalAmountCents) / 100).toFixed(2)}`} />
				<MetricCard label="Deposit" value={`$${(Number(b.depositAmountCents) / 100).toFixed(2)}`} />
				<MetricCard label="Balance due" value={`$${(Number(b.balanceDueCents) / 100).toFixed(2)}`} />
				<MetricCard label="Net revenue" value={`$${(Number(b.netRevenueCents) / 100).toFixed(2)}`} />
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<DetailSection title="Tour" description="Booked experience">
					{b.tour ? (
						<>
							<p className="font-medium">{b.tour.name}</p>
							<Link to="/dashboard/tours/$tourId" params={{ tourId: b.tour._id }} className="text-blue-600 hover:underline text-xs">
								View tour →
							</Link>
						</>
					) : (
						<p className="text-muted-foreground">(deleted)</p>
					)}
				</DetailSection>

				<DetailSection title="Customer" description="Who is attending">
					{b.customer ? (
						<>
							<p className="font-medium">{b.customer.name}</p>
							<p className="text-muted-foreground">{b.customer.email}</p>
							<Link to="/dashboard/customers/$customerId" params={{ customerId: b.customer._id }} className="text-blue-600 hover:underline text-xs">
								View customer →
							</Link>
						</>
					) : (
						<p className="text-muted-foreground">(deleted)</p>
					)}
				</DetailSection>
			</div>

			<DetailSection title="Booking details">
				<DetailRow label="Source" value={b.source} />
				<DetailRow label="Payment method" value={b.paymentMethod || "(none)"} />
				<DetailRow label="Guest names" value={b.guestNames || "(none)"} />
				<DetailRow label="Notes" value={b.notes || "(none)"} />
				<DetailRow
					label="Checked in"
					value={
						b.checkedInAt
							? `${new Date(b.checkedInAt).toLocaleString()} by ${b.checkedInBy || "unknown"}`
							: "(not checked in)"
					}
				/>
				<DetailRow
					label="Completed at"
					value={b.completedAt ? new Date(b.completedAt).toLocaleString() : "(not completed)"}
				/>
			</DetailSection>

			{(b.reviewRating || b.reviewComment) && (
				<DetailSection title="Customer review">
					{b.reviewRating && (
						<p className="text-2xl font-semibold">
							{"★".repeat(b.reviewRating)}
							<span className="text-muted-foreground">{"☆".repeat(5 - b.reviewRating)}</span>
						</p>
					)}
					{b.reviewComment && <p>{b.reviewComment}</p>}
				</DetailSection>
			)}
		</DetailPage>
	);
}
