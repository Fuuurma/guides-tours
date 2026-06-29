import { cn } from "@/lib/utils";

function Skeleton({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			data-slot="skeleton"
			className={cn("animate-pulse rounded-md bg-muted", className)}
			{...props}
		/>
	);
}

/**
 * Standard loading skeleton for detail / edit / settings pages.
 * Replaces the 5-line copy-pasted skeleton block in 16+ route files.
 */
function DetailSkeleton({ className }: { className?: string }) {
	return (
		<div className={cn("space-y-4 p-4", className)}>
			<Skeleton className="h-8 w-1/3" />
			<Skeleton className="h-4 w-1/2" />
			<Skeleton className="h-32 w-full" />
			<Skeleton className="h-4 w-full" />
			<Skeleton className="h-4 w-2/3" />
		</div>
	);
}

export { DetailSkeleton, Skeleton };
