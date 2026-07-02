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
//
// Hardening:
// - Origin allowlist via PUBLIC_BOOKING_ALLOWED_ORIGINS env var.
//   If unset, all origins are allowed (development-friendly
//   default). Set this in production to your marketing-site domain
//   (e.g. "https://tours.example.com,https://www.example.com").
//   The Origin header is optional in modern browsers for same-origin
//   POST; we only reject when an Origin is present and not allowed.
// - Per-email rate limit (5 attempts / 15 min) via
//   convex/lib/rate_limit.ts. Enforced inside the createForSlug
//   action so it can't be bypassed by hitting the httpAction
//   repeatedly with different slugs.
http.route({
	path: "/api/public/book/:slug",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		if (request.method !== "POST") {
			return new Response("method not allowed", { status: 405 });
		}

		// Origin check (only if explicitly configured).
		const origin = request.headers.get("origin");
		const allowedOriginsRaw = process.env.PUBLIC_BOOKING_ALLOWED_ORIGINS;
		if (origin && allowedOriginsRaw) {
			const allowed = allowedOriginsRaw
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			if (allowed.length > 0 && !allowed.includes(origin)) {
				return new Response("origin not allowed", { status: 403 });
			}
		}

		// Content-Type must be JSON — reject anything else so a
		// multipart upload or text blob can't slip past the JSON
		// parser below.
		const ct = request.headers.get("content-type") ?? "";
		if (!ct.toLowerCase().startsWith("application/json")) {
			return new Response("content-type must be application/json", {
				status: 415,
			});
		}

		const url = new URL(request.url);
		const segments = url.pathname.split("/").filter(Boolean);
		const slugIdx = segments.indexOf("book");
		if (slugIdx < 0 || slugIdx === segments.length - 1) {
			return new Response("missing slug", { status: 400 });
		}
		const slug = segments[slugIdx + 1];

		// Cap the request body at 8 KB — the booking payload is tiny
		// (~6 fields). Anything larger is either an attacker probing
		// for memory exhaustion or a buggy client.
		const contentLength = Number(request.headers.get("content-length") ?? 0);
		const MAX_BODY_BYTES = 8 * 1024;
		if (contentLength > MAX_BODY_BYTES) {
			return new Response("payload too large", { status: 413 });
		}

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
		// SECURITY: reject non-positive or over-large guests rather than
		// silently defaulting to 1 — a sloppy default would let an
		// attacker bypass the min-guests validation by sending a
		// non-number (string, object, NaN, etc). 200 is an absolute
		// upper bound; the tour's own maxGuests is enforced by
		// createForSlug inside the action.
		const MAX_GUESTS_PER_BOOKING = 200;
		const rawGuests = payload.guests;
		const guests =
			typeof rawGuests === "number" &&
			Number.isFinite(rawGuests) &&
			rawGuests >= 1 &&
			rawGuests <= MAX_GUESTS_PER_BOOKING
				? Math.floor(rawGuests)
				: null;
		const customerPhone =
			typeof payload.customerPhone === "string"
				? payload.customerPhone
				: undefined;
		const notes =
			typeof payload.notes === "string" ? payload.notes : undefined;

		if (
			!tourId ||
			!customerName ||
			!customerEmail ||
			!date ||
			!startTime ||
			guests === null
		) {
			return new Response(
				"missing or invalid required fields: tourId, customerName, customerEmail, date, startTime, guests (positive integer <= 200)",
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
			let status = 400;
			if (typeof message === "string") {
				if (message.includes("not found")) status = 404;
				else if (message.includes("rate limit")) status = 429;
			}
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