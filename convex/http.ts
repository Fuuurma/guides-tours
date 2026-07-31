import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { registerOtaRoutes } from "./ota/router";
import { stripeWebhook } from "./payments_stripe_actions";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

// Better Auth's catch-all handler for /api/auth/* (sign-up, sign-in,
// get-session, OAuth callbacks, etc).
//
// Using `registerRoutesLazy` (canonical pattern from
// tech-stack/AUTH-OAUTH.md §4) so we can pass runtime config:
// - basePath matches the same-origin proxy at /api/auth/*
// - trustedOrigins includes both the app origin (SITE_URL) and the
//   Convex site (used by `crossDomain` once Google OAuth is added)
// - cors enabled so the dev cross-origin Vite proxy can hit it
authComponent.registerRoutesLazy(http, createAuth, {
  basePath: "/api/auth",
  cors: true,
  trustedOrigins: [
    process.env.SITE_URL ?? "http://127.0.0.1:3020",
    process.env.CONVEX_SITE_URL,
  ].filter((origin): origin is string => typeof origin === "string"),
});

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

// Public booking endpoint — POST /api/public/book/<slug>. No auth
// required (visitors from the marketing site). The slug identifies
// the organization; the body identifies tour + customer.
//
// Routing: Convex's HTTP router does NOT support path-parameter
// syntax in `path` (the `path` field is exact-match). We register
// `pathPrefix: "/api/public/book/"` so any path that begins with
// that prefix routes here, then parse the slug from the URL path
// below. The trailing `/` is required by the router.
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
	pathPrefix: "/api/public/book/",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		if (request.method !== "POST") {
			return new Response("method not allowed", { status: 405 });
		}

		// Origin check (only if explicitly configured).
		// When an allowlist is set, reject requests with no Origin
		// header — browsers always send Origin for cross-origin POSTs,
		// so a missing header means a non-browser client or a
		// same-origin request from a compromised subdomain.
		const origin = request.headers.get("origin");
		const allowedOriginsRaw = process.env.PUBLIC_BOOKING_ALLOWED_ORIGINS;
		if (allowedOriginsRaw) {
			const allowed = allowedOriginsRaw
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			if (allowed.length > 0) {
				if (!origin || !allowed.includes(origin)) {
					return new Response("origin not allowed", { status: 403 });
				}
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

		// Validate slug format: alphanumeric, hyphens, underscores only.
		// Prevents path traversal and limits slug length.
		const SLUG_RE = /^[a-zA-Z0-9_-]{1,100}$/;
		if (!slug || !SLUG_RE.test(slug)) {
			return new Response("invalid slug", { status: 400 });
		}

		// Cap the request body at 8 KB — the booking payload is tiny
		// (~6 fields). Anything larger is either an attacker probing
		// for memory exhaustion or a buggy client. We check the actual
		// body length, not the Content-Length header (which can be
		// spoofed or omitted).
		const MAX_BODY_BYTES = 8 * 1024;
		let rawBody: string;
		try {
			rawBody = await request.text();
		} catch {
			return new Response("failed to read body", { status: 400 });
		}
		if (rawBody.length > MAX_BODY_BYTES) {
			return new Response("payload too large", { status: 413 });
		}

		let payload: unknown;
		try {
			payload = JSON.parse(rawBody);
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
		const scheduleId =
			typeof payload.scheduleId === "string" ? payload.scheduleId : undefined;
		const emailConsent =
			typeof payload.emailConsent === "boolean"
				? payload.emailConsent
				: undefined;
		const smsConsent =
			typeof payload.smsConsent === "boolean" ? payload.smsConsent : undefined;

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

		// Extract client IP for per-IP rate limiting. CF-Connecting-IP
		// is set by Cloudflare; X-Forwarded-For is the standard fallback.
		const ip =
			request.headers.get("cf-connecting-ip") ??
			request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
			"";

		const { internal } = await import("./_generated/api");
		try {
			const result = await ctx.runAction(
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
					scheduleId: scheduleId as Id<"tourSchedules"> | undefined,
					emailConsent,
					smsConsent,
					ip,
				},
			);
			return new Response(
				JSON.stringify(
					typeof result === "string"
						? { bookingId: result, status: "confirmed" }
						: result,
				),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			);
		} catch (err) {
			// Log full error server-side for debugging.
			console.error("[public-booking] Error:", err);
			// Return only safe, user-facing error messages to the
			// client — internal details could aid attackers.
			let message = "An error occurred processing your booking";
			let status = 500;
			if (err instanceof ConvexError) {
				const data = err.data as string;
				if (typeof data === "string") {
					const lower = data.toLowerCase();
					if (lower.includes("rate limit")) {
						message = "Too many booking attempts. Please try again later.";
						status = 429;
					} else if (lower.includes("not found")) {
						message = "Tour, schedule, or organization not found";
						status = 404;
					} else if (lower.includes("capacity") || lower.includes("over capacity")) {
						message = "This tour is fully booked";
						status = 400;
					} else if (lower.includes("blacked out") || lower.includes("not available")) {
						message = "This date is not available for booking";
						status = 400;
					} else if (lower.includes("past") || lower.includes("cutoff")) {
						message = "Cannot book tours in the past or within the cutoff period";
						status = 400;
					} else if (lower.includes("invalid email")) {
						message = "Invalid email address";
						status = 400;
					} else if (lower.includes("missing") || lower.includes("invalid")) {
						message = data;
						status = 400;
					}
				}
			} else if (err instanceof Error && err.message.includes("Validator error")) {
				// Convex args validator rejected the input — this is a
				// client-side error, not a server fault.
				message = "Invalid request data";
				status = 400;
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
