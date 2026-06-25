// Shared types for OTA integrations.
//
// Each provider has its own payload shape but they all reduce to the
// same logical events:
//
//   - booking.created  → upsert otaBookings row + create our booking
//   - booking.cancelled → mark otaBookings row cancelled + cancel our booking
//   - availability.update → push new availability to otaAvailabilityCache
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

export type ProviderSlug =
	| "viator"
	| "getYourGuide"
	| "airbnb"
	| "tripAdvisor"
	| "klook"
	| "booking"
	| "expedia";

export const ALL_PROVIDERS: readonly ProviderSlug[] = [
	"viator",
	"getYourGuide",
	"airbnb",
	"tripAdvisor",
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
