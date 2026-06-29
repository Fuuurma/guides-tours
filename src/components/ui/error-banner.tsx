import { cn } from "@/lib/utils";

/**
 * Styled error banner used across the dashboard.
 * Replaces the bare `<p className="text-destructive text-sm">Error: ...</p>`
 * pattern in detail pages and the inconsistent error UIs across the app.
 */
export function ErrorBanner({
	message,
	className,
}: {
	message: string;
	className?: string;
}) {
	return (
		<div
			role="alert"
			className={cn(
				"rounded-md border border-destructive/50 bg-destructive/10 p-3",
				className,
			)}
		>
			<p className="text-destructive text-sm font-medium">{message}</p>
		</div>
	);
}
