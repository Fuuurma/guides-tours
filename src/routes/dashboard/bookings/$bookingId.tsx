import { convexQuery } from "@convex-dev/react-query";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useMutation, usePaginatedQuery } from "convex/react";
import { Mail, Phone, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { StripePaymentElement } from "@/components/stripe-payment-element";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCentsCompact } from "@/lib/format";
import {
	cn,
	getErrorMessage,
	getSafeDisplayMessage,
	isStripeCheckoutUrl,
} from "@/lib/utils";
import { MAX_NOTES_LEN, validateNotesOptional } from "@/lib/validation";
import type { BookingDetail } from "@/types/entities";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const RATINGS = [1, 2, 3, 4, 5] as const;
const MAX_CANCEL_REASON_LEN = 500;

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
	const createCheckout = useAction(
		api.payments_stripe_actions.createHostedCheckout,
	);
	const createPaymentIntent = useAction(
		api.payments_stripe_actions.createCheckoutSession,
	);
	const [pending, setPending] = useState(false);
	const [showCancelForm, setShowCancelForm] = useState(false);
	const [showReviewForm, setShowReviewForm] = useState(false);
	const [showRefundForm, setShowRefundForm] = useState(false);
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
				<CancelBookingForm
					bookingId={bookingId as Id<"bookings">}
					onDismiss={() => setShowCancelForm(false)}
				/>
			)}

			{showRefundForm && succeededPayment && (
				<RefundPaymentForm
					paymentId={succeededPayment._id as Id<"payments">}
					onDismiss={() => setShowRefundForm(false)}
				/>
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
				<div className="mt-4 flex flex-col gap-3 rounded-md border p-4">
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
					{b.reviewRating ? <ReviewStars rating={b.reviewRating} /> : null}
					{b.reviewComment && <p>{b.reviewComment}</p>}
				</DetailSection>
			)}

			{b.status === "completed" && !b.reviewRating && (
				<DetailSection title="Record review">
					{!showReviewForm ? (
						<Button variant="outline" onClick={() => setShowReviewForm(true)}>
							Record review
						</Button>
					) : (
						<RecordReviewForm
							bookingId={b._id as Id<"bookings">}
							onDismiss={() => setShowReviewForm(false)}
						/>
					)}
				</DetailSection>
			)}
		</DetailPage>
	);
}

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

function ReviewStars({ rating }: { rating: number }) {
	return (
		<p className="flex items-center gap-1">
			<span className="sr-only">{rating} out of 5</span>
			{RATINGS.map((n) => (
				<Star
					key={n}
					aria-hidden="true"
					className={cn(
						"size-5",
						n <= rating ? "fill-current text-star" : "text-muted-foreground",
					)}
				/>
			))}
		</p>
	);
}

function CancelBookingForm({
	bookingId,
	onDismiss,
}: {
	bookingId: Id<"bookings">;
	onDismiss: () => void;
}) {
	const cancelBooking = useMutation(api.bookings.cancel);
	const form = useForm({
		defaultValues: { reason: "" },
		onSubmit: async ({ value }) => {
			const trimmed = value.reason.trim();
			if (!trimmed) {
				form.setFieldMeta("reason", (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: "Please provide a reason" },
				}));
				return;
			}
			if (trimmed.length > MAX_CANCEL_REASON_LEN) {
				form.setFieldMeta("reason", (prev) => ({
					...prev,
					errorMap: {
						...prev.errorMap,
						onSubmit: `Cancel reason is too long (max ${MAX_CANCEL_REASON_LEN} characters)`,
					},
				}));
				return;
			}
			try {
				await cancelBooking({ bookingId, reason: trimmed });
				toast.success("Booking cancelled");
				onDismiss();
			} catch (err) {
				toast.error(getErrorMessage(err));
			}
		},
	});

	return (
		<form
			className="rounded-md border border-destructive/50 bg-destructive/5 p-4"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<FieldGroup className="gap-4">
				<form.Field name="reason">
					{(field) => (
						<Field data-invalid={!field.state.meta.isValid}>
							<FieldLabel htmlFor="cancel-reason">Cancel booking</FieldLabel>
							<FieldDescription>
								This will be recorded in the audit log.
							</FieldDescription>
							<Textarea
								id="cancel-reason"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="Reason for cancellation (customer request, weather, etc.)"
								rows={2}
								maxLength={MAX_CANCEL_REASON_LEN}
								aria-invalid={!field.state.meta.isValid}
							/>
							<FieldError errors={metaErrors(field.state.meta.errors)} />
						</Field>
					)}
				</form.Field>
				<form.Subscribe
					selector={(state) => [state.canSubmit, state.isSubmitting] as const}
				>
					{([canSubmit, isSubmitting]) => (
						<div className="flex gap-2">
							<Button
								type="submit"
								variant="destructive"
								disabled={!canSubmit || isSubmitting}
							>
								{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
								{isSubmitting ? "Cancelling…" : "Confirm cancellation"}
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={onDismiss}
								disabled={isSubmitting}
							>
								Keep booking
							</Button>
						</div>
					)}
				</form.Subscribe>
			</FieldGroup>
		</form>
	);
}

function RefundPaymentForm({
	paymentId,
	onDismiss,
}: {
	paymentId: Id<"payments">;
	onDismiss: () => void;
}) {
	const refundPayment = useAction(api.payments_stripe_actions.refundViaStripe);
	const form = useForm({
		defaultValues: { reason: "" },
		onSubmit: async ({ value }) => {
			const notesErr = validateNotesOptional(value.reason);
			if (notesErr) {
				form.setFieldMeta("reason", (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: notesErr },
				}));
				return;
			}
			try {
				await refundPayment({
					paymentId,
					reason: value.reason.trim() || undefined,
				});
				toast.success("Payment refunded");
				onDismiss();
			} catch (err) {
				toast.error(getErrorMessage(err));
			}
		},
	});

	return (
		<form
			className="rounded-md border border-destructive/50 bg-destructive/5 p-4"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<FieldGroup className="gap-4">
				<form.Field name="reason">
					{(field) => (
						<Field data-invalid={!field.state.meta.isValid}>
							<FieldLabel htmlFor="refund-reason">Refund via Stripe</FieldLabel>
							<FieldDescription>
								Money is returned to the customer and the booking balance is
								restored.
							</FieldDescription>
							<Textarea
								id="refund-reason"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="Reason for refund (optional)"
								rows={2}
								maxLength={MAX_CANCEL_REASON_LEN}
								aria-invalid={!field.state.meta.isValid}
							/>
							<FieldError errors={metaErrors(field.state.meta.errors)} />
						</Field>
					)}
				</form.Field>
				<form.Subscribe
					selector={(state) => [state.canSubmit, state.isSubmitting] as const}
				>
					{([canSubmit, isSubmitting]) => (
						<div className="flex gap-2">
							<Button
								type="submit"
								variant="destructive"
								disabled={!canSubmit || isSubmitting}
							>
								{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
								{isSubmitting ? "Refunding…" : "Confirm refund"}
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={onDismiss}
								disabled={isSubmitting}
							>
								Keep payment
							</Button>
						</div>
					)}
				</form.Subscribe>
			</FieldGroup>
		</form>
	);
}

function RecordReviewForm({
	bookingId,
	onDismiss,
}: {
	bookingId: Id<"bookings">;
	onDismiss: () => void;
}) {
	const recordReview = useMutation(api.bookings.recordReview);
	const form = useForm({
		defaultValues: { rating: 5, comment: "" },
		onSubmit: async ({ value }) => {
			if (value.rating < 1 || value.rating > 5) {
				form.setFieldMeta("rating", (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: "Rating must be 1-5" },
				}));
				return;
			}
			const notesErr = validateNotesOptional(value.comment);
			if (notesErr) {
				form.setFieldMeta("comment", (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: notesErr },
				}));
				return;
			}
			try {
				await recordReview({
					bookingId,
					rating: value.rating,
					comment: value.comment.trim() || undefined,
				});
				toast.success("Review recorded");
				onDismiss();
			} catch (err) {
				toast.error(getErrorMessage(err));
			}
		},
	});

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<FieldGroup className="gap-3">
				<form.Field name="rating">
					{(field) => (
						<Field data-invalid={!field.state.meta.isValid}>
							<FieldLabel htmlFor="booking-rating">Rating</FieldLabel>
							<ToggleGroup
								id="booking-rating"
								type="single"
								spacing={1}
								value={String(field.state.value)}
								onValueChange={(v) => {
									if (v) field.handleChange(Number(v));
								}}
								aria-label="Rating"
								aria-invalid={!field.state.meta.isValid}
							>
								{RATINGS.map((n) => (
									<ToggleGroupItem
										key={n}
										value={String(n)}
										aria-label={`${n} star${n === 1 ? "" : "s"}`}
										className={cn(
											"size-10 px-0 data-[state=on]:bg-transparent data-[state=on]:text-star",
											n <= field.state.value
												? "text-star"
												: "text-muted-foreground",
										)}
									>
										<Star
											className={
												n <= field.state.value ? "fill-current" : undefined
											}
										/>
									</ToggleGroupItem>
								))}
							</ToggleGroup>
							<FieldError errors={metaErrors(field.state.meta.errors)} />
						</Field>
					)}
				</form.Field>
				<form.Field name="comment">
					{(field) => (
						<Field data-invalid={!field.state.meta.isValid}>
							<FieldLabel htmlFor="review-comment">
								Comment (optional)
							</FieldLabel>
							<Textarea
								id="review-comment"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								rows={3}
								maxLength={MAX_NOTES_LEN}
								placeholder="What did the customer think?"
								aria-invalid={!field.state.meta.isValid}
							/>
							<FieldError errors={metaErrors(field.state.meta.errors)} />
						</Field>
					)}
				</form.Field>
				<form.Subscribe
					selector={(state) => [state.canSubmit, state.isSubmitting] as const}
				>
					{([canSubmit, isSubmitting]) => (
						<div className="flex gap-2">
							<Button type="submit" disabled={!canSubmit || isSubmitting}>
								{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
								{isSubmitting ? "Saving…" : "Save review"}
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={onDismiss}
								disabled={isSubmitting}
							>
								Cancel
							</Button>
						</div>
					)}
				</form.Subscribe>
			</FieldGroup>
		</form>
	);
}
