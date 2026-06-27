// GetYourGuide OTA integration.
//
// Source: backend/ota/getyourguide/client.py::GetYourGuideClient.
//
// Auth: HTTP Basic — header `Authorization: Basic base64(partner_id:api_key)`.
// Base URLs:
//   - production: https://api.getyourguide.com/v1
//   - sandbox:    https://api-sandbox.getyourguide.com/v1
// Webhook events (source):
//   - BOOKING_CREATED
//   - BOOKING_CANCELLED
// Webhook auth: HMAC-SHA256 over raw body, hex digest in
//               x-getyourguide-signature header (no `sha256=` prefix).

import { OTAHttpClient, HttpError } from "./http_client";
import type { DecryptedCredentials, NormalizedProviderEvent } from "./types";

const PROD_BASE_URL = "https://api.getyourguide.com/v1";
const SANDBOX_BASE_URL = "https://api-sandbox.getyourguide.com/v1";

export interface GetYourGuideOptions {
	credentials: DecryptedCredentials;
	isSandbox: boolean;
	timeoutMs?: number;
}

export class GetYourGuideClient {
	private readonly client: OTAHttpClient;

	constructor(opts: GetYourGuideOptions) {
		if (!opts.credentials.apiKey) {
			throw new Error("GetYourGuide requires apiKey");
		}
		if (!opts.credentials.partnerId) {
			throw new Error("GetYourGuide requires partnerId");
		}
		const apiKey = opts.credentials.apiKey;
		const partnerId = opts.credentials.partnerId;
		// HTTP Basic: base64(partner_id:api_key). btoa is global in
		// browsers + Convex default runtime + Node 20+.
		const auth = btoa(`${partnerId}:${apiKey}`);
		this.client = new OTAHttpClient({
			baseUrl: opts.isSandbox ? SANDBOX_BASE_URL : PROD_BASE_URL,
			getHeaders: async () => ({
				Authorization: `Basic ${auth}`,
			}),
			timeoutMs: opts.timeoutMs,
		});
	}

	async createProduct(product: {
		title: string;
		description?: string;
		durationMinutes?: number;
	}): Promise<{ productId: string }> {
		const res = await this.client.post<{ productId: string }>(
			"/activities",
			product,
		);
		return res.body;
	}

	async updateAvailability(args: {
		activityId: string;
		optionId: string;
		date: string;
		availableSpaces: number;
	}): Promise<void> {
		await this.client.post(
			`/activities/${encodeURIComponent(args.activityId)}/options/${encodeURIComponent(args.optionId)}/availability`,
			{
				date: args.date,
				available: args.availableSpaces,
			},
		);
	}

	async getAvailability(args: {
		activityId: string;
		optionId: string;
		startDate: string;
		endDate: string;
	}): Promise<unknown[]> {
		const res = await this.client.get<{ data: unknown[] }>(
			`/activities/${encodeURIComponent(args.activityId)}/options/${encodeURIComponent(args.optionId)}/availability`,
			{
				startDate: args.startDate,
				endDate: args.endDate,
			},
		);
		return res.body.data ?? [];
	}

	async getBookings(args: {
		startDate?: string;
		endDate?: string;
	}): Promise<unknown[]> {
		const res = await this.client.get<{ data: unknown[] }>(
			"/bookings",
			args,
		);
		return res.body.data ?? [];
	}

	/**
	 * Normalize a GetYourGuide webhook payload into a NormalizedProviderEvent.
	 * Returns null if the event type is unknown.
	 *
	 * Source of truth:
	 *   tours/services/ota_webhook_service.py::_handle_getyourguide_webhook
	 *
	 * Source reads:
	 *   event_type = payload.get("type", "")
	 *   if event_type == "booking_created":
	 *       data.bookingId         → reservation_id
	 *       data.confirmationCode  → confirmation_code (informational)
	 *       data.traveler.{name,email}  → guest_name, guest_email
	 *       data.participants      → guest_count
	 *       data.totalAmount       → total_amount (already in major units)
	 *       data.tourDate, data.tourTime
	 *
	 * Source does NOT register a cancelled handler — for cancellations
	 * GetYourGuide has a polling-only model in source. We accept
	 * booking.cancelled events anyway for forward-compat.
	 */
	static normalize(
		payload: unknown,
	): NormalizedProviderEvent | null {
		if (!isRecord(payload)) return null;
		const eventType = typeof payload.type === "string"
			? payload.type
			: typeof payload.eventType === "string"
				? payload.eventType
				: null;
		if (!eventType) return null;

		if (eventType === "booking_created") {
			const data = isRecord(payload.data) ? payload.data : null;
			if (!data) return null;
			const traveler = isRecord(data.traveler) ? data.traveler : null;
			const totalPaid = numberOrUndefined(
				data.totalAmount ?? data.total_amount,
			);
			return {
				kind: "booking.created",
				reservationId: stringOrThrow(
					data.bookingId ?? data.id,
					"data.bookingId",
				),
				productId: stringOrUndefined(
					data.activityId ?? data.activity_id,
				),
				customerName: stringOrThrow(
					traveler?.name ?? data.guestName ?? data.guest_name,
					"traveler.name",
				),
				customerEmail: stringOrThrow(
					traveler?.email ?? data.guestEmail ?? data.guest_email,
					"traveler.email",
				),
				customerPhone: stringOrUndefined(traveler?.phone),
				customerCountry: stringOrUndefined(traveler?.country),
				tourDate: stringOrThrow(
					data.tourDate ?? data.tour_date,
					"data.tourDate",
				),
				tourTime: stringOrUndefined(
					data.tourTime ?? data.tour_time,
				),
				guests: numberOrThrow(
					data.participants ?? data.guests ?? data.guestCount,
					"data.participants",
				),
				totalPaidCents: totalPaid !== undefined
					? BigInt(Math.round(totalPaid * 100))
					: undefined,
				currency: stringOrUndefined(data.currency),
				rawPayload: payload,
			};
		}

		if (eventType === "booking_cancelled") {
			const data = isRecord(payload.data) ? payload.data : null;
			const id = stringOrUndefined(data?.bookingId ?? data?.id);
			if (!id) return null;
			return {
				kind: "booking.cancelled",
				reservationId: id,
				rawPayload: payload,
			};
		}

		return null;
	}
}

// --- Helpers ---

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringOrThrow(v: unknown, label: string): string {
	if (typeof v === "string" && v.length > 0) return v;
	throw new Error(`GetYourGuide webhook: missing ${label}`);
}

function stringOrUndefined(v: unknown): string | undefined {
	if (typeof v === "string" && v.length > 0) return v;
	if (typeof v === "number") return String(v);
	return undefined;
}

function numberOrThrow(v: unknown, label: string): number {
	const n = numberOrUndefined(v);
	if (n === undefined) {
		throw new Error(`GetYourGuide webhook: missing ${label}`);
	}
	return n;
}

function numberOrUndefined(v: unknown): number | undefined {
	if (typeof v === "number") return v;
	if (typeof v === "string") {
		const n = Number(v);
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
}

// Re-export so consumers don't need a second import.
export { HttpError };