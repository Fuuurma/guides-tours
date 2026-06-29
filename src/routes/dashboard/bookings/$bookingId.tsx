import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatCentsCompact } from "@/lib/format";
import { api } from "../../../../convex/_generated/api";
import { getErrorMessage } from "@/lib/utils";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/bookings/$bookingId")({
	component: BookingDetailPage,
});

function BookingDetailPage() {
	const { bookingId } = Route.useParams();
	const {
		data: booking,
		isPending,
		error,
	} = useQuery(
		convexQuery(api.bookings.get, { bookingId: bookingId as Id<"bookings"> }),
	);
	const checkIn = useMutation(api.bookings.checkIn);
	const complete = useMutation(api.bookings.complete);
	const cancelBooking = useMutation(api.bookings.cancel);
	const recordReview = useMutation(api.bookings.recordReview);
	const [pending, setPending] = useState(false);
	const [showCancelForm, setShowCancelForm] = useState(false);
	const [cancelReason, setCancelReason] = useState("");
	const [showReviewForm, setShowReviewForm] = useState(false);
	const [reviewRating, setReviewRating] = useState("5");
	const [reviewComment, setReviewComment] = useState("");

	const runAction = async (fn: () => Promise<unknown>, msg: string) => {
		setPending(true);
		try {
			await fn();
			toast.success(msg);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(false);
		}
	};

	const onCheckIn = () =>
		runAction(
			() => checkIn({ bookingId: bookingId as Id<"bookings"> }),
			"Customer checked in",
		);
	const onComplete = () =>
		runAction(
			() => complete({ bookingId: bookingId as Id<"bookings"> }),
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
					bookingId: bookingId as Id<"bookings">,
					reason: cancelReason,
				}),
			"Booking cancelled",
		).then(() => {
			setShowCancelForm(false);
			setCancelReason("");
		});
	};

	if (isPending) {
		return (
		<DetailSkeleton />
		);
	}
	if (error)
		return <p className="text-destructive text-sm">Error: {error.message}</p>;
	if (!booking) {
		return (
			<DetailPage title="Booking not found" backTo="/dashboard/bookings" />
		);
	}

	const b = booking as unknown as {
		_id: string;
		date: string;
		startTime: string;
		guests: number;
		status: string;
		source: string;
		totalAmountCents: bigint | number;
		depositAmountCents: bigint | number;
		balanceDueCents: bigint | number;
		netRevenueCents: bigint | number;
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
					{["pending", "confirmed", "checked_in"].includes(b.status) && (
						<Button asChild variant="outline">
							<Link
								to="/dashboard/bookings/$bookingId/edit"
								params={{ bookingId: b._id as Id<"bookings"> }}
							>
								Edit
							</Link>
						</Button>
					)}
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
					{["pending", "confirmed", "checked_in"].includes(b.status) && (
						<Button
							variant="destructive"
							onClick={() => setShowCancelForm(true)}
							disabled={pending}
						>
							Cancel
						</Button>
					)}
				</>
			}
		>
			{showCancelForm && (
				<div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 space-y-4">
					<p className="text-sm font-medium">
						Cancel booking — this will be recorded in the audit log.
					</p>
					<Textarea
						value={cancelReason}
						onChange={(e) => setCancelReason(e.target.value)}
						placeholder="Reason for cancellation (e.g. customer request, weather, etc.)"
						rows={2}
						maxLength={500}
					/>
					<div className="flex gap-2">
						<Button variant="destructive" onClick={onCancel} disabled={pending}>
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
				</div>
			)}

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<MetricCard
					label="Total"
					value={formatCentsCompact(b.totalAmountCents)}
				/>
				<MetricCard
					label="Deposit"
					value={formatCentsCompact(b.depositAmountCents)}
				/>
				<MetricCard
					label="Balance due"
					value={formatCentsCompact(b.balanceDueCents)}
				/>
				<MetricCard
					label="Net revenue"
					value={formatCentsCompact(b.netRevenueCents)}
				/>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<DetailSection title="Tour" description="Booked experience">
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
				</DetailSection>

				<DetailSection title="Customer" description="Who is attending">
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
					value={
						b.completedAt
							? new Date(b.completedAt).toLocaleString()
							: "(not completed)"
					}
				/>
			</DetailSection>

			{(b.reviewRating || b.reviewComment) && (
				<DetailSection title="Customer review">
					{b.reviewRating && (
						<p className="text-2xl font-semibold">
							{"★".repeat(b.reviewRating)}
							<span className="text-muted-foreground">
								{"☆".repeat(5 - b.reviewRating)}
							</span>
						</p>
					)}
					{b.reviewComment && <p>{b.reviewComment}</p>}
				</DetailSection>
			)}

			{/* Record-review form: only available for completed bookings
			    that don't already have a review. */}
			{b.status === "completed" && !b.reviewRating && (
				<DetailSection title="Record review">
					{!showReviewForm ? (
						<Button variant="outline" onClick={() => setShowReviewForm(true)}>
							Record review
						</Button>
					) : (
						<div className="space-y-3">
							<label
								htmlFor="booking-rating"
								className="text-sm font-medium block"
							>
								Rating (1-5)
							</label>
							<div className="flex gap-1" role="radiogroup" aria-label="Rating">
								{[1, 2, 3, 4, 5].map((n) => (
									<button
										key={n}
										type="button"
										aria-label={`${n} star${n === 1 ? "" : "s"}`}
										aria-pressed={reviewRating === String(n)}
										onClick={() => setReviewRating(String(n))}
										className={`text-3xl leading-none p-1 rounded hover:bg-accent ${
											reviewRating === String(n)
												? "text-yellow-500"
												: "text-muted-foreground"
										}`}
									>
										{n <= Number(reviewRating) ? "★" : "☆"}
									</button>
								))}
							</div>
							<label
								htmlFor="review-comment"
								className="text-sm font-medium block"
							>
								Comment (optional)
							</label>
							<Textarea
								id="review-comment"
								value={reviewComment}
								onChange={(e) => setReviewComment(e.target.value)}
								rows={3}
								maxLength={1000}
								placeholder="What did the customer think?"
							/>
							<div className="flex gap-2">
								<Button
									onClick={async () => {
										const r = Number(reviewRating);
										if (r < 1 || r > 5) {
											toast.error("Rating must be 1-5");
											return;
										}
										setPending(true);
										try {
											await recordReview({
												bookingId: b._id as Id<"bookings">,
												rating: r,
												comment: reviewComment.trim() || undefined,
											});
											toast.success("Review recorded");
											setShowReviewForm(false);
											setReviewComment("");
										} catch (err) {
											toast.error(getErrorMessage(err));
										} finally {
											setPending(false);
										}
									}}
									disabled={pending}
								>
									{pending ? "Saving…" : "Save review"}
								</Button>
								<Button
									variant="outline"
									onClick={() => {
										setShowReviewForm(false);
										setReviewComment("");
									}}
									disabled={pending}
								>
									Cancel
								</Button>
							</div>
						</div>
					)}
				</DetailSection>
			)}
		</DetailPage>
	);
}
