// Shared types for OTA integrations.
//
// Each provider has its own payload shape but they all reduce to the
// same logical events:
//
//   - booking.created  → upsert otaBookings row + create our booking
//   - booking.cancelled → mark otaBookings row cancelled + cancel our booking
//   - availability.update → push new availability to otaAvailabilityCache
//
// F264 adjudication (2026-09-25): no provider normalizer currently
// emits availability.update — every push-side availability payload
// normalizes to null and is acked "ignored". The pipeline below is
// kept as deliberate forward-compat scaffolding: dedup (F55), the
// unmatched-product skip (F340), and the upsert itself are all tested
// and ready the moment a provider adapter maps an availability event.
// Wiring an actual producer is a per-provider feature, not a defect —
// this comment is the explicit record that the path is unfed by design.
//
// The webhook handlers per provider normalize their payload into one
// of these normalized events before calling the generic upsert.

export type NormalizedProviderEvent =
	| {
			kind: "booking.created";
			reservationId: string;
			// Optional because some webhook payloads don't carry a product
			// identifier (e.g. GetYourGuide source only sends bookingId +
			// traveler info). The upsert falls back to "unmatched" when
			// this is absent.
			productId?: string;
			customerName: string;
			customerEmail: string;
			customerPhone?: string;
			customerCountry?: string;
			tourDate: string;
			tourTime?: string;
			guests: number;
			totalPaidCents?: bigint;
			currency?: string;
			commissionRate?: number;
			commissionCents?: bigint;
			rawPayload: unknown;
	  }
	| {
			kind: "booking.cancelled";
			reservationId: string;
			rawPayload: unknown;
	  }
	| {
			kind: "availability.update";
			productId: string;
			date: string;
			availableSpaces: number;
			totalSpaces: number;
			rawPayload: unknown;
	  };

// Provider slugs are the lowercase strings webhook handlers write to
// otaIntegrations.provider / webhookDeliveries.source and that the UI
// list (src/components/ota-providers.ts) pins — keep this union in
// sync with the stored values, not the brands' camelCase spellings
// (needs-work 2026-09-10).
export type ProviderSlug =
	| "viator"
	| "getyourguide"
	| "airbnb"
	| "tripadvisor"
	| "klook"
	| "booking"
	| "expedia";

export const ALL_PROVIDERS: readonly ProviderSlug[] = [
	"viator",
	"getyourguide",
	"airbnb",
	"tripadvisor",
	"klook",
	"booking",
	"expedia",
] as const;

/**
 * Provider credentials, decrypted by the caller. Stored encrypted
 * in otaIntegrations (see convex/lib/crypto.ts).
 */
export type DecryptedCredentials = {
	apiKey: string;
	apiSecret?: string;
	partnerId?: string;
	webhookSecret?: string;
};
