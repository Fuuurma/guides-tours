import { Link } from "@tanstack/react-router";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Shared cell that renders a tour link with fallback for unknown tours.
 * Used in schedules and assignments list pages.
 */
export function TourCell({
	tourId,
	tourNameById,
}: {
	tourId: string;
	tourNameById: Map<string, string>;
}) {
	const name = tourNameById.get(tourId);
	return (
		<Link
			to="/dashboard/tours/$tourId"
			params={{ tourId: tourId as Id<"tours"> }}
			className="text-blue-600 hover:underline truncate"
		>
			{name ?? (
				<span className="text-muted-foreground italic text-xs">
					Unknown tour
				</span>
			)}
		</Link>
	);
}
