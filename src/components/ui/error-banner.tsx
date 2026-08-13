import { CircleAlert } from "lucide-react";
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
				"flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4",
				className,
			)}
		>
			<CircleAlert
				aria-hidden="true"
				className="mt-0.5 size-5 shrink-0 text-destructive"
			/>
			<div className="min-w-0">
				<p className="text-destructive text-sm font-medium">{message}</p>
				{hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
				{action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
			</div>
		</div>
	);
}
