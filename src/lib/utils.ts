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
