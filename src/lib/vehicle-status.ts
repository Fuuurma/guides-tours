/**
 * The vehicle status set, declared once for the client.
 *
 * It was written out in four places — the entity type, the form's toggle
 * options, the list page's select options and a cast that silenced the
 * type checker — while the server carried its own copies (F696). The server
 * owns the truth: its validator refuses any status outside the set. The
 * client's job is to send only values the server accepts, so the set lives
 * here once and every client surface reads it.
 */
export const VEHICLE_STATUSES = [
	"available",
	"in_use",
	"maintenance",
	"retired",
] as const;

export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

/**
 * The status when `value` is one of the set, undefined otherwise.
 *
 * A select or a toggle can hand back any string, so the value is checked
 * against the set instead of being cast into it.
 */
export function toVehicleStatus(value: string): VehicleStatus | undefined {
	return (VEHICLE_STATUSES as readonly string[]).includes(value)
		? (value as VehicleStatus)
		: undefined;
}
