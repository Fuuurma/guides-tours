import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decideCheckoutSettlement } from "../checkoutSettlement";

/**
 * F555 — `checkout.session.completed` must not be read as "the money arrived".
 *
 * The webhook dispatched `completed` straight to the success path, so a
 * delayed method (SEPA / ACH / boleto) credited the booking balance on the
 * day the customer clicked pay. `markFailed` refuses any non-`pending` row, so
 * the `async_payment_failed` that arrived days later threw instead of
 * repairing it.
 *
 * These pin the decision table. The wiring is a thin switch in
 * `payments_stripe_actions.ts`; what matters is that the table itself cannot
 * be edited into treating `unpaid` as collected.
 */
describe("decideCheckoutSettlement (F555)", () => {
	it("waits when a completed session's payment is still unpaid", () => {
		expect(decideCheckoutSettlement("checkout.session.completed", "unpaid")).toBe(
			"await-async",
		);
	});

	it("collects a completed session whose payment is paid", () => {
		expect(decideCheckoutSettlement("checkout.session.completed", "paid")).toBe(
			"mark-succeeded",
		);
	});

	it("collects a completed session that required no payment", () => {
		expect(
			decideCheckoutSettlement("checkout.session.completed", "no_payment_required"),
		).toBe("mark-succeeded");
	});

	it("treats an absent payment_status as settled, preserving prior behaviour", () => {
		expect(decideCheckoutSettlement("checkout.session.completed", undefined)).toBe(
			"mark-succeeded",
		);
	});

	it("collects on async success — the event that actually carries settlement", () => {
		expect(
			decideCheckoutSettlement("checkout.session.async_payment_succeeded", "paid"),
		).toBe("mark-succeeded");
	});

	it("fails on async failure, so the booking can be unwound", () => {
		expect(
			decideCheckoutSettlement("checkout.session.async_payment_failed", "unpaid"),
		).toBe("mark-failed");
	});

	it("does not claim unrelated events", () => {
		for (const type of [
			"payment_intent.succeeded",
			"payment_intent.payment_failed",
			"charge.refunded",
			"invoice.paid",
			undefined,
		]) {
			expect(decideCheckoutSettlement(type, "paid")).toBe("not-applicable");
		}
	});

	it("a delayed payment is never collected before its async event", () => {
		// The whole bug in one assertion: the completed event for an unpaid
		// session must not reach the success path.
		const completed = decideCheckoutSettlement("checkout.session.completed", "unpaid");
		const laterSuccess = decideCheckoutSettlement(
			"checkout.session.async_payment_succeeded",
			"paid",
		);
		expect(completed).not.toBe("mark-succeeded");
		expect(laterSuccess).toBe("mark-succeeded");
	});
});

/**
 * The webhook is an `httpAction`, which convexTest cannot invoke — the
 * existing `payments_stripe_webhook.test.ts` says so and calls the internal
 * mutations directly instead. So the decision table above is executed, but
 * the dispatcher's own branch is not.
 *
 * These are SHAPE checks, not behaviour checks, and the first version of them
 * was worse than useless: asserting that the text `await-async` appears
 * between the decision and the fulfilment stayed green when the arm was
 * neutered to `if (false && settlement === "await-async")`, because the string
 * was still there. So these now pin the control-flow form — an
 * `await-async` guard whose `else` carries the fulfilment. Undoing the fix
 * still has to touch the dispatcher and still fails here, but a determined
 * rewiring would not be caught, and it is not caught.
 */
describe("webhook wiring (source shape, not executed)", () => {
	const dispatcher = readFileSync(
		new URL("../../payments_stripe_actions.ts", import.meta.url),
		"utf8",
	);

	it("routes the async success and failure events", () => {
		expect(dispatcher).toContain("CHECKOUT_SESSION_ASYNC_SUCCEEDED");
		expect(dispatcher).toContain("CHECKOUT_SESSION_ASYNC_FAILED");
	});

	it("an unpaid completed session is guarded out of the fulfilment path", () => {
		// `if (settlement === "await-async") { … } else { applyPaymentSuccess… }`
		// The `else` is load-bearing: it is what keeps an unsettled session off
		// the success path, and a neutered condition must fail this.
		// `[\s\S]*?` rather than `[^}]*` because the log line in between
		// interpolates `${eventType}`, and a character-class exclusion stops
		// at the first `}` it meets inside a template literal.
		expect(dispatcher).toMatch(
			/if \(settlement === "await-async"\) \{[\s\S]*?\} else \{[\s\S]*?applyPaymentSuccess/,
		);
	});
});
