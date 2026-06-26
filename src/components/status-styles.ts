// Centralized status → badge class lookup.
//
// Replaces 6 duplicate statusColors maps across the codebase
// (customers/tours/bookings/schedules/assignments/vacations/vehicles
// /notifications). The "completed" / "cancelled" status had two
// conflicting color assignments depending on context — we standardize
// here:
//   - cancelled → gray (terminal neutral)
//   - completed → green (success terminal)
//   - checked_in, scheduled, in_use, email → blue (active/operational)
//   - available, confirmed, approved, sms → green (positive state)
//   - pending, full, maintenance → yellow (caution / waiting)
//   - rejected → red (failure)
//   - retired → gray (decommissioned)
//   - both → purple (combined channel)
//
// Use the StatusBadge component — it reads from this map and renders
// a shadcn <Badge variant="..."> consistent with the rest of the UI.

import type { BadgeProps } from "@/components/ui/badge";

export type StatusVariant = NonNullable<BadgeProps["variant"]>;

// Direct class lookup for cases where a Badge isn't appropriate
// (e.g. inline in a table cell where a full <Badge> is too heavy).
export const STATUS_CLASSES: Record<string, string> = {
	// Booking statuses
	pending: "bg-yellow-100 text-yellow-800",
	confirmed: "bg-green-100 text-green-800",
	checked_in: "bg-blue-100 text-blue-800",
	completed: "bg-green-100 text-green-800",
	cancelled: "bg-gray-100 text-gray-800",

	// Schedule statuses
	available: "bg-green-100 text-green-800",
	full: "bg-yellow-100 text-yellow-800",

	// Vehicle statuses
	in_use: "bg-blue-100 text-blue-800",
	maintenance: "bg-yellow-100 text-yellow-800",
	retired: "bg-gray-100 text-gray-800",

	// Assignment statuses
	scheduled: "bg-blue-100 text-blue-800",

	// Vacation statuses
	approved: "bg-green-100 text-green-800",
	rejected: "bg-red-100 text-red-800",

	// Notification channel
	email: "bg-blue-100 text-blue-800",
	sms: "bg-green-100 text-green-800",
	both: "bg-purple-100 text-purple-800",

	// Generic active/inactive (tours, drivers, templates)
	active: "bg-green-100 text-green-800",
	inactive: "bg-gray-100 text-gray-800",

	// Customer VIP
	vip: "bg-amber-100 text-amber-800",
	regular: "bg-gray-100 text-gray-800",
};

// Variant lookup for StatusBadge (semantic shadcn variants).
export const STATUS_VARIANTS: Record<string, StatusVariant> = {
	// Positive / success
	confirmed: "default",
	checked_in: "secondary",
	completed: "default",
	available: "default",
	approved: "default",
	// Active / operational
	scheduled: "secondary",
	in_use: "secondary",
	// Caution / waiting
	pending: "outline",
	full: "outline",
	maintenance: "outline",
	// Failure
	rejected: "destructive",
	// Terminal neutral
	cancelled: "secondary",
	retired: "secondary",
	// Special
	email: "secondary",
	sms: "default",
	both: "outline",

	// Generic active/inactive
	active: "default",
	inactive: "secondary",

	// Customer VIP
	vip: "outline",
	regular: "secondary",
};

/**
 * Map an arbitrary status string to a Tailwind class pair.
 * Falls back to secondary coloring for unknown statuses.
 */
export function statusClass(status: string): string {
	return STATUS_CLASSES[status] ?? "bg-secondary text-secondary-foreground";
}

/**
 * Map an arbitrary status string to a shadcn Badge variant.
 * Falls back to "outline" for unknown statuses.
 */
export function statusVariant(status: string): StatusVariant {
	return STATUS_VARIANTS[status] ?? "outline";
}
