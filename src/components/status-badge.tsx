import { statusVariant } from "@/components/status-styles";
import { Badge } from "@/components/ui/badge";

export interface StatusBadgeProps {
	status: string;
	/**
	 * Optional override for the displayed label. Defaults to the status
	 * itself, with snake_case converted to Title Case.
	 */
	label?: string;
	className?: string;
}

/**
 * Renders a status badge with colors derived from a single source of
 * truth (see `status-styles.ts`). Use everywhere a status needs to
 * be displayed, in place of the old duplicated `bg-{color}-100
 * text-{color}-800` patterns.
 *
 * @example
 *   <StatusBadge status={booking.status} />
 *   <StatusBadge status="checked_in" />
 */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
	return (
		<Badge variant={statusVariant(status)} className={className}>
			{label ?? humanize(status)}
		</Badge>
	);
}

/** Convert snake_case / kebab-case to Title Case. */
function humanize(s: string): string {
	return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
