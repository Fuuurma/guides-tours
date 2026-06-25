import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { registerOtaRoutes } from "./ota/router";
import { stripeWebhook } from "./payments_stripe_actions";
import { ConvexError } from "convex/values";

const http = httpRouter();

// Better Auth's catch-all handler for /api/auth/* (sign-up, sign-in,
// get-session, OAuth callbacks, etc).
authComponent.registerRoutes(http, createAuth);

// Mount OTA webhook routes. Each provider's handler is registered
// at /api/ota/webhooks/{provider}. Add new providers in
// convex/ota/router.ts.
registerOtaRoutes(http);

// Stripe webhook — POST /api/payments/stripe/webhook. Verifies the
// signature against the org's stored webhook secret, then dispatches
// payment_intent.succeeded / payment_intent.payment_failed /
// charge.refunded to the payments table.
http.route({
	path: "/api/payments/stripe/webhook",
	method: "POST",
	handler: stripeWebhook,
});

// Public booking endpoint — POST /api/public/book/:slug. No auth
// required (visitors from the marketing site). The slug identifies
// the organization; the body identifies tour + customer.
http.route({
	path: "/api/public/book/:slug",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		if (request.method !== "POST") {
			return new Response("method not allowed", { status: 405 });
		}
		const url = new URL(request.url);
		const segments = url.pathname.split("/").filter(Boolean);
		const slugIdx = segments.indexOf("book");
		if (slugIdx < 0 || slugIdx === segments.length - 1) {
			return new Response("missing slug", { status: 400 });
		}
		const slug = segments[slugIdx + 1];

		let payload: unknown;
		try {
			payload = await request.json();
		} catch {
			return new Response("invalid JSON", { status: 400 });
		}
		if (!isRecord(payload)) {
			return new Response("invalid payload", { status: 400 });
		}

		const tourId = typeof payload.tourId === "string" ? payload.tourId : null;
		const customerName =
			typeof payload.customerName === "string" ? payload.customerName : null;
		const customerEmail =
			typeof payload.customerEmail === "string"
				? payload.customerEmail.toLowerCase().trim()
				: null;
		const date = typeof payload.date === "string" ? payload.date : null;
		const startTime =
			typeof payload.startTime === "string" ? payload.startTime : null;
		const guests =
			typeof payload.guests === "number" && payload.guests > 0
				? Math.floor(payload.guests)
				: 1;
		const customerPhone =
			typeof payload.customerPhone === "string"
				? payload.customerPhone
				: undefined;
		const notes =
			typeof payload.notes === "string" ? payload.notes : undefined;

		if (!tourId || !customerName || !customerEmail || !date || !startTime) {
			return new Response(
				"missing required fields: tourId, customerName, customerEmail, date, startTime",
				{ status: 400 },
			);
		}

		const { internal } = await import("./_generated/api");
		try {
			const bookingId = await ctx.runAction(
				internal.public_booking.createForSlug,
				{
					slug,
					tourId,
					customerName,
					customerEmail,
					customerPhone,
					date,
					startTime,
					guests,
					notes,
				},
			);
			return new Response(
				JSON.stringify({ bookingId, status: "confirmed" }),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			);
		} catch (err) {
			const message =
				err instanceof ConvexError
					? (err.data as string)
					: err instanceof Error
						? err.message
						: "internal error";
			const status =
				typeof message === "string" && message.includes("not found")
					? 404
					: 400;
			return new Response(JSON.stringify({ error: message }), {
				status,
				headers: { "content-type": "application/json" },
			});
		}
	}),
});

export default http;

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}