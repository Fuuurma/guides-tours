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
