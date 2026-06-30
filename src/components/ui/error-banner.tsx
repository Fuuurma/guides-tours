import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Styled error banner used across the dashboard.
 * Replaces the bare `<p className="text-destructive text-sm">Error: ...</p>`
 * pattern in detail pages and the inconsistent error UIs across the app.
 *
 * Use `hint` for a secondary explanatory line (e.g. "Reload the page to retry").
 */
export function ErrorBanner({
	message,
	hint,
	action,
	className,
}: {
	message: string;
	hint?: string;
	action?: React.ReactNode;
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
			{hint && <p className="text-muted-foreground text-sm mt-1">{hint}</p>}
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}
