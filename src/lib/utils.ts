export { cn } from "cn";

/**
 * Safely extract an error message from an unknown thrown value.
 * Replaces the unsafe `(err as Error).message` pattern used in
 * 25+ catch blocks across the dashboard.
 *
 * Also handles Better Auth client error objects — those are returned
 * (not thrown) as `{ error: { message, status, statusText, code } }`
 * or `{ message, status }` shapes, and would otherwise stringify to
 * "[object Object]".
 */
export function getErrorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (err && typeof err === "object") {
		const candidate = err as {
			message?: unknown;
			error?: { message?: unknown };
		};
		const msg = candidate.message ?? candidate.error?.message;
		if (typeof msg === "string" && msg.length > 0) return msg;
	}
	return String(err);
}

/**
 * Return a user-safe error message for display in error banners.
 * ConvexError messages are authored by us and safe to show. Other
 * errors (network failures, internal errors) get a generic message
 * to avoid leaking backend implementation details.
 */
/**
 * Case-insensitive markers of operational/infra error text that must never
 * reach the UI: Convex request IDs, plan-limit notices, network failures,
 * and JS engine TypeErrors. ConvexError messages are authored by us and
 * safe to show — but infra failures arrive as plain Errors and used to
 * sail straight through (public booking page rendered request IDs and
 * support emails verbatim).
 */
const OPERATIONAL_MARKERS = [
	"internal server error",
	"validator error",
	"request id",
	"called by client",
	"support@",
	"convex.dev",
	"convex q(",
	"exceeded the free plan",
	"deployments have been disabled",
	"failed to fetch",
	"networkerror",
	"load failed",
	"unexpected token",
	"is not a function",
	"cannot read propert",
	"cannot read ",
	"undefined is not",
	"null is not",
];

/** Authored messages are short; anything longer is infra spew until proven otherwise. */
const MAX_DISPLAY_MESSAGE_LENGTH = 160;

/**
 * Return a user-safe error message for display in error banners.
 * ConvexError messages are authored by us and safe to show. Other
 * errors (network failures, internal errors) get a generic message
 * to avoid leaking backend implementation details. Redacted originals
 * go to console.error so support can still diagnose from the log.
 */
export function getSafeDisplayMessage(err: unknown): string {
	const fallback = "Something went wrong. Please try again.";
	if (err instanceof Error) {
		const msg = err.message;
		if (msg) {
			const lower = msg.toLowerCase();
			const operational =
				msg.length > MAX_DISPLAY_MESSAGE_LENGTH ||
				OPERATIONAL_MARKERS.some((marker) => lower.includes(marker));
			if (!operational) return msg;
			console.error("[ui-error] redacted operational message:", msg);
		}
	}
	return fallback;
}

/**
 * Validate that a URL points to a trusted Stripe domain before
 * using it for navigation. Prevents open redirects if the backend
 * is compromised or returns an unexpected value.
 */
export function isStripeCheckoutUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") return false;
		const host = parsed.hostname;
		return (
			host === "checkout.stripe.com" ||
			host === "connect.stripe.com" ||
			host.endsWith(".stripe.com")
		);
	} catch {
		return false;
	}
}
