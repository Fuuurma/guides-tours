import { v } from "convex/values";

/**
 * The vehicle status set, declared once.
 *
 * The same four literals were hand-written in five places — the schema
 * table and four mutations — and two of those mutations accepted any
 * string at all (F696). A status outside the set matches no
 * `by_org_status` index filter, so the vehicle silently vanished from
 * fleet views and the booking-path pickers failed closed, leaving it
 * unassignable until someone guessed the raw value back.
 *
 * Every server surface now reads this one declaration: a status outside
 * the set is refused by argument validation, before it can be written.
 */
export const VEHICLE_STATUSES = [
	"available",
	"in_use",
	"maintenance",
	"retired",
] as const;

export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

const STATUS_LITERALS = [
	v.literal("available"),
	v.literal("in_use"),
	v.literal("maintenance"),
	v.literal("retired"),
] as const;

/** The Convex validator for the set above. */
export const vehicleStatusValidator = v.union(...STATUS_LITERALS);
