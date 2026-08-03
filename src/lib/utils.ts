import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Safely extract an error message from an unknown thrown value.
 * Replaces the unsafe `(err as Error).message` pattern used in
 * 25+ catch blocks across the dashboard.
 */
export function getErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * Return a user-safe error message for display in error banners.
 * ConvexError messages are authored by us and safe to show. Other
 * errors (network failures, internal errors) get a generic message
 * to avoid leaking backend implementation details.
 */
export function getSafeDisplayMessage(err: unknown): string {
	if (err instanceof Error) {
		const msg = err.message;
		// ConvexError messages are our own thrown strings — safe to show.
		// They typically contain user-facing messages like "Tour not found".
		if (
			msg &&
			!msg.includes("Internal Server Error") &&
			!msg.includes("Validator error")
		) {
			return msg;
		}
	}
	return "Something went wrong. Please try again.";
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
