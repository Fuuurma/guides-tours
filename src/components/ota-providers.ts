// Single source of truth for the OTA provider list.
//
// Used by:
//   - /dashboard/ota  — list/connect providers
//   - /dashboard/bookings  — source filter chips
//
// If you add a new provider here, also add a corresponding entry to
// convex/ota/router.ts (the webhook URL) and a webhooks/<name>.ts
// file (the handler). The router will fail at runtime if the
// provider is missing.

export const ALL_PROVIDERS = [
	{ id: "viator", label: "Viator" },
	{ id: "getyourguide", label: "GetYourGuide" },
	{ id: "airbnb", label: "Airbnb" },
	{ id: "tripadvisor", label: "TripAdvisor" },
	{ id: "klook", label: "Klook" },
	{ id: "booking", label: "Booking.com" },
	{ id: "expedia", label: "Expedia" },
] as const;

export type OtaProviderId = (typeof ALL_PROVIDERS)[number]["id"];

/** Human-readable label for a provider id. Falls back to the raw id. */
export function providerLabel(id: string): string {
	return ALL_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}
