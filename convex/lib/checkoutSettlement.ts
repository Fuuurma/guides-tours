// Which Stripe event may mark a Checkout payment as collected.
//
// `checkout.session.completed` does NOT mean the money arrived. It fires when
// the customer finishes the Checkout flow, and `status: "complete"` explicitly
// allows payment to still be in progress — which is exactly what happens for
// every delayed method (SEPA, ACH us_bank_account, boleto, konbini, oxxo).
// Those sessions complete immediately and settle days later, resolving
// through `checkout.session.async_payment_succeeded` / `_failed`.
//
// Treating `completed` as collected credits a booking balance for money that
// has not arrived. The damage is not self-healing: `markFailed` refuses any
// row that is not `pending`, so the later failure cannot repair the premature
// success — it throws instead.
//
// The gate is `payment_status !== "unpaid"`, which admits "paid" and
// "no_payment_required" and is what Stripe's own reference implementation
// does. An absent `payment_status` is treated as settled, preserving the
// pre-gate behaviour for payloads that do not carry the field.

type CheckoutSettlement =
	/** Funds are collected (or were never required) — safe to fulfil. */
	| "mark-succeeded"
	/** Session is complete but the money is still in flight — wait. */
	| "await-async"
	/** A delayed payment failed after the session completed. */
	| "mark-failed"
	/** Not a Checkout-session event; the caller handles it elsewhere. */
	| "not-applicable";

export const CHECKOUT_SESSION_ASYNC_SUCCEEDED =
	"checkout.session.async_payment_succeeded";
export const CHECKOUT_SESSION_ASYNC_FAILED =
	"checkout.session.async_payment_failed";

export function decideCheckoutSettlement(
	eventType: string | undefined,
	paymentStatus: string | undefined,
): CheckoutSettlement {
	if (eventType === CHECKOUT_SESSION_ASYNC_SUCCEEDED) return "mark-succeeded";
	if (eventType === CHECKOUT_SESSION_ASYNC_FAILED) return "mark-failed";
	if (eventType === "checkout.session.completed") {
		return paymentStatus === "unpaid" ? "await-async" : "mark-succeeded";
	}
	return "not-applicable";
}
