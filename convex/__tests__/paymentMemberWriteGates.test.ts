// F936 — the two member-facing checkout actions minted live payment
// instruments (a PaymentIntent + clientSecret, and a hosted Checkout
// URL) while admitting member through a requireRole literal the
// declared matrix denies: member holds payment:["read"] only, and the
// customer-facing path is the public guest flow, not staff minting.
// F934/F938 fixed the same class elsewhere.
//
// Structural pin (the tourMemberWriteGates idiom — Better Auth
// sessions cannot be exercised end-to-end in convex-test): each
// checkout path must bind to the declared matrix via
// requirePermission(ctx, "payment", "create"), and no member-admitting
// requireRole literal may remain in the file.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILE = "payments_stripe_actions";

const src = () =>
	readFileSync(new URL(`../${FILE}.ts`, import.meta.url), "utf8");

function bodyOf(fn: string): string {
	const body = src();
	const start = body.indexOf(`export const ${fn} = `);
	expect(start, `${FILE}.${fn} not found`).toBeGreaterThanOrEqual(0);
	const tail = body.slice(start);
	const next = tail.indexOf("\nexport const ");
	return next === -1 ? tail : tail.slice(0, next);
}

describe("member write gates on payment surfaces (F936)", () => {
	it("no member-admitting requireRole literal remains in the payments file", () => {
		expect(
			src().includes('"member"'),
			`${FILE} still admits member in a literal`,
		).toBe(false);
	});

	it("createCheckoutSession binds requirePermission(payment, create)", () => {
		expect(
			bodyOf("createCheckoutSession"),
			"createCheckoutSession must gate on payment:create",
		).toContain('requirePermission(ctx, "payment", "create")');
	});

	it("createHostedCheckout binds requirePermission(payment, create)", () => {
		expect(
			bodyOf("createHostedCheckout"),
			"createHostedCheckout must gate on payment:create",
		).toContain('requirePermission(ctx, "payment", "create")');
	});
});
