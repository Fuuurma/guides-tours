// Centralized status → badge variant lookup.
//
// Replaces 6 duplicate statusColors maps across the codebase
// (customers/tours/bookings/schedules/assignments/vacations/vehicles
// /notifications). The old maps assigned literal colors (green / blue /
// yellow / red / gray / purple) per context, with "completed" /
// "cancelled" conflicting between contexts. We standardize on shadcn
// Badge variants instead, so this module delivers variant semantics
// rather than literal colors:
//   - default (solid primary) → confirmed, completed, available,
//     approved, sms, active (positive / success terminal)
//   - secondary (muted) → checked_in, scheduled, in_use, email
//     (active/operational) plus cancelled, retired, inactive,
//     regular (terminal neutral)
//   - outline (neutral bordered) → pending, full, maintenance
//     (caution / waiting) plus both, vip, and the unknown-status
//     fallback
//   - destructive (red) → rejected (failure)
//
// Use the StatusBadge component — it reads from this map and renders
// a shadcn <Badge variant="..."> consistent with the rest of the UI.

import type { BadgeProps } from "@/components/ui/badge";

export type StatusVariant = NonNullable<BadgeProps["variant"]>;

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
 * Map an arbitrary status string to a shadcn Badge variant.
 * Falls back to "outline" for unknown statuses.
 */
export function statusVariant(status: string): StatusVariant {
	return STATUS_VARIANTS[status] ?? "outline";
}
