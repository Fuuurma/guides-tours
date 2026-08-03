import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useMutation, usePaginatedQuery } from "convex/react";
import { Mail, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { StripePaymentElement } from "@/components/stripe-payment-element";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatCentsCompact } from "@/lib/format";
import {
	getErrorMessage,
	getSafeDisplayMessage,
	isStripeCheckoutUrl,
} from "@/lib/utils";
import type { BookingDetail } from "@/types/entities";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/** Safe mailto: href — strips anything that looks like a protocol or newline. */
function safeMailto(email: string): string {
	const clean = email.replace(/[\s<>"'`]/g, "");
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return "#";
	return `mailto:${clean}`;
}

/** Safe tel: href — allows digits, +, -, spaces, parens only. */
function safeTel(phone: string): string {
	const clean = phone.replace(/[^\d+()\-\s]/g, "");
	if (!clean) return "#";
	return `tel:${clean}`;
}

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
	const payments = usePaginatedQuery(
		api.payments.list,
		{
			bookingId: bookingId as Id<"bookings">,
		},
		{ initialNumItems: 20 },
	);
	const { data: paySettings } = useQuery(
		convexQuery(api.payments.getPublicSettings, {}),
	);
	const checkIn = useMutation(api.bookings.checkIn);
	const confirmBooking = useMutation(api.bookings.confirm);
	const complete = useMutation(api.bookings.complete);
	const cancelBooking = useMutation(api.bookings.cancel);
	const recordReview = useMutation(api.bookings.recordReview);
	const refundPayment = useAction(api.payments_stripe_actions.refundViaStripe);
	const createCheckout = useAction(
		api.payments_stripe_actions.createHostedCheckout,
	);
	const createPaymentIntent = useAction(
		api.payments_stripe_actions.createCheckoutSession,
	);
	const [pending, setPending] = useState(false);
	const [showCancelForm, setShowCancelForm] = useState(false);
	const [cancelReason, setCancelReason] = useState("");
	const [showReviewForm, setShowReviewForm] = useState(false);
	const [reviewRating, setReviewRating] = useState("5");
	const [reviewComment, setReviewComment] = useState("");
	const [showRefundForm, setShowRefundForm] = useState(false);
	const [refundReason, setRefundReason] = useState("");
	const [elementsOpen, setElementsOpen] = useState(false);
	const [clientSecret, setClientSecret] = useState<string | null>(null);
	const [publishableKey, setPublishableKey] = useState<string | null>(null);

	// Toast once after Stripe Checkout redirect (?paid=1).
	useEffect(() => {
		if (typeof window === "undefined") return;
		const params = new URLSearchParams(window.location.search);
		if (params.get("paid") !== "1") return;
		toast.success(
			"Payment received — balance will update when Stripe confirms",
		);
		params.delete("paid");
		const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
		window.history.replaceState({}, "", next);
	}, []);

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
	const onConfirm = () =>
		runAction(
			() => confirmBooking({ bookingId: bookingId as Id<"bookings"> }),
			"Booking confirmed — customer notification queued",
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
		return <DetailSkeleton />;
	}
	if (error) return <ErrorBanner message={getSafeDisplayMessage(error)} />;
	if (!booking) {
		return (
			<DetailPage title="Booking not found" backTo="/dashboard/bookings" />
		);
	}

	const b = booking as unknown as BookingDetail;

	const paymentItems = payments.results;
	const succeededPayment = paymentItems.find((p) => p.status === "succeeded");

	const onRefund = () => {
		if (!succeededPayment) return;
		runAction(
			() =>
				refundPayment({
					paymentId: succeededPayment._id as Id<"payments">,
					reason: refundReason.trim() || undefined,
				}),
			"Payment refunded",
		).then(() => {
			setShowRefundForm(false);
			setRefundReason("");
		});
	};

	const balanceDue = Number(b.balanceDueCents ?? 0);
	const canCollect =
		balanceDue > 0 && ["pending", "confirmed", "checked_in"].includes(b.status);

	const onCollectHosted = async () => {
		if (balanceDue <= 0) {
			toast.error("Nothing to collect");
			return;
		}
		setPending(true);
		try {
			const { url } = await createCheckout({
				bookingId: bookingId as Id<"bookings">,
			});
			if (!isStripeCheckoutUrl(url)) {
				toast.error("Invalid checkout URL received");
				setPending(false);
				return;
			}
			window.location.href = url;
		} catch (err) {
			toast.error(getErrorMessage(err));
			setPending(false);
		}
	};

	const onOpenElements = async () => {
		if (balanceDue <= 0) {
			toast.error("Nothing to collect");
			return;
		}
		setPending(true);
		try {
			const result = await createPaymentIntent({
				bookingId: bookingId as Id<"bookings">,
				amountCents: BigInt(balanceDue),
			});
			setClientSecret(result.clientSecret);
			setPublishableKey(
				result.publishableKey || paySettings?.stripePublishableKey || null,
			);
			setElementsOpen(true);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(false);
		}
	};

	const closeElements = () => {
		setElementsOpen(false);
		setClientSecret(null);
	};

	return (
		<DetailPage
			title={`Booking ${b._id.slice(-8)}`}
			subtitle={`${b.date} at ${b.startTime} · ${b.guests} guests`}
			backTo="/dashboard/bookings"
			actions={
				<>
					<StatusBadge status={b.status} />
					{b.status === "pending" && (
						<Button onClick={onConfirm} disabled={pending}>
							Confirm booking
						</Button>
					)}
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

			{showRefundForm && succeededPayment && (
				<div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 space-y-4">
					<p className="text-sm font-medium">
						Refund via Stripe — money is returned to the customer and the
						booking balance is restored.
					</p>
					<Textarea
						value={refundReason}
						onChange={(e) => setRefundReason(e.target.value)}
						placeholder="Reason for refund (optional)"
						rows={2}
						maxLength={500}
					/>
					<div className="flex gap-2">
						<Button variant="destructive" onClick={onRefund} disabled={pending}>
							{pending ? "Refunding…" : "Confirm refund"}
						</Button>
						<Button
							variant="outline"
							onClick={() => {
								setShowRefundForm(false);
								setRefundReason("");
							}}
						>
							Cancel
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

			{succeededPayment && (
				<div className="mt-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowRefundForm(true)}
						disabled={pending}
					>
						Refund payment
					</Button>
				</div>
			)}

			{canCollect && (
				<div className="mt-4 space-y-3 rounded-md border p-4">
					<p className="text-sm font-medium">
						Collect {formatCentsCompact(b.balanceDueCents)}
					</p>
					{elementsOpen && clientSecret && publishableKey ? (
						<StripePaymentElement
							publishableKey={publishableKey}
							clientSecret={clientSecret}
							returnUrl={
								typeof window !== "undefined"
									? `${window.location.origin}/dashboard/bookings/${bookingId}?paid=1`
									: `/dashboard/bookings/${bookingId}?paid=1`
							}
							amountLabel={formatCentsCompact(b.balanceDueCents)}
							onPaid={() => {
								toast.success(
									"Payment submitted — balance updates when Stripe confirms",
								);
								closeElements();
							}}
							onCancel={closeElements}
						/>
					) : (
						<div className="flex flex-wrap gap-2">
							<Button
								size="sm"
								onClick={onOpenElements}
								disabled={pending || !paySettings?.stripePublishableKey}
							>
								{pending ? "Preparing…" : "Pay on this page"}
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={onCollectHosted}
								disabled={pending}
							>
								{pending ? "Opening…" : "Open Stripe Checkout"}
							</Button>
						</div>
					)}
					{!paySettings?.stripePublishableKey && !elementsOpen ? (
						<p className="text-muted-foreground text-xs">
							Add a Stripe publishable key in{" "}
							<Link
								to="/dashboard/settings/payments"
								className="text-link hover:underline"
							>
								Payment settings
							</Link>{" "}
							to use in-page Payment Element.
						</p>
					) : (
						<p className="text-muted-foreground text-xs">
							Pay on this page uses Stripe Payment Element. Checkout opens
							Stripe’s hosted page.
						</p>
					)}
				</div>
			)}

			<div className="grid gap-4 md:grid-cols-2">
				<DetailSection title="Tour" description="Booked experience">
					{b.tour ? (
						<>
							<p className="font-medium">{b.tour.name}</p>
							<Link
								to="/dashboard/tours/$tourId"
								params={{ tourId: b.tour._id }}
								className="text-link hover:underline text-xs"
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
							{b.customer.phone ? (
								<p className="text-muted-foreground">{b.customer.phone}</p>
							) : null}
							<div className="flex flex-wrap gap-2 pt-1">
								<Button asChild size="sm" variant="outline">
									<a href={safeMailto(b.customer.email)}>
										<Mail aria-hidden="true" />
										Email customer
									</a>
								</Button>
								{b.customer.phone ? (
									<Button asChild size="sm" variant="outline">
										<a href={safeTel(b.customer.phone)}>
											<Phone aria-hidden="true" />
											Call customer
										</a>
									</Button>
								) : null}
							</div>
							<Link
								to="/dashboard/customers/$customerId"
								params={{ customerId: b.customer._id }}
								className="text-link hover:underline text-xs"
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
				<DetailRow
					label="Recorded payment method"
					value={b.paymentMethod || "Not recorded — use Collect below"}
				/>
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

			<DetailSection
				title={`Payment activity (${paymentItems.length})`}
				description="Stripe charges and refunds recorded for this booking"
			>
				{paymentItems.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No payment has been recorded yet. The balance remains outstanding.
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{paymentItems.map((payment) => (
							<li
								key={payment._id}
								className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
							>
								<div>
									<p className="font-medium">
										{formatCentsCompact(payment.amountCents)} ·{" "}
										{payment.provider}
									</p>
									<p className="text-muted-foreground text-xs">
										{payment.currency} ·{" "}
										{new Date(payment.createdAt).toLocaleString()}
									</p>
								</div>
								<StatusBadge status={payment.status} />
							</li>
						))}
					</ul>
				)}
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
												? "text-star"
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
