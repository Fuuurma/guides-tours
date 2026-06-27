// Booking.com Tours OTA integration.
//
// Source: backend/ota/booking/client.py::BookingClient.
//
// Auth: single API key sent via `X-Booking-API-Key` header.
// Base URLs:
//   - production: https://api.booking.com/v1
//   - sandbox:    https://api-sandbox.booking.com/v1
//
// NOTE: Source does NOT register a webhook handler for Booking.com
// (tours/services/ota_webhook_service.py only handles Viator,
// GetYourGuide, Airbnb, TripAdvisor, Klook). We provide
// BookingClient.normalize + a webhook handler anyway, using the
// same RESERVATION_CREATED / RESERVATION_CANCELLED shape that
// source's parse_webhook_event anticipates — matches the rest of
// the family.

import { OTAHttpClient, HttpError } from "./http_client";
import type { DecryptedCredentials, NormalizedProviderEvent } from "./types";

const PROD_BASE_URL = "https://api.booking.com/v1";
const SANDBOX_BASE_URL = "https://api-sandbox.booking.com/v1";

export interface BookingOptions {
	credentials: DecryptedCredentials;
	isSandbox: boolean;
	timeoutMs?: number;
}

export class BookingClient {
	private readonly client: OTAHttpClient;

	constructor(opts: BookingOptions) {
		if (!opts.credentials.apiKey) {
			throw new Error("Booking.com requires apiKey");
		}
		const apiKey = opts.credentials.apiKey;
		this.client = new OTAHttpClient({
			baseUrl: opts.isSandbox ? SANDBOX_BASE_URL : PROD_BASE_URL,
			getHeaders: async () => ({ "X-Booking-API-Key": apiKey }),
			timeoutMs: opts.timeoutMs,
		});
	}

	async createProduct(product: {
		name: string;
		description?: string;
		category?: string;
		durationMinutes?: number;
	}): Promise<{ productId: string }> {
		const res = await this.client.post<{ productId: string }>(
			"/products",
			product,
		);
		return res.body;
	}

	async updateAvailability(args: {
		productId: string;
		availabilityUpdates: Array<{
			date: string;
			isAvailable: boolean;
			capacity: number;
		}>;
	}): Promise<void> {
		await this.client.post(
			`/products/${encodeURIComponent(args.productId)}/availability`,
			{ availabilityUpdates: args.availabilityUpdates },
		);
	}

	async getAvailability(args: {
		productId: string;
		startDate: string;
		endDate: string;
	}): Promise<unknown[]> {
		const res = await this.client.get<{ data: unknown[] }>(
			`/products/${encodeURIComponent(args.productId)}/availability`,
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
		status?: string;
	}): Promise<unknown[]> {
		const res = await this.client.get<{ data: unknown[] }>(
			"/reservations",
			args,
		);
		return res.body.data ?? [];
	}

	/**
	 * Normalize a Booking.com webhook payload.
	 *
	 * NOTE: Source does NOT register a webhook handler for Booking.com
	 * (tours/services/ota_webhook_service.py only handles Viator,
	 * GetYourGuide, Airbnb, TripAdvisor, Klook). The shape below is
	 * informed by booking/client.py::parse_webhook_event (dead code in
	 * source) and Booking.com's actual partner API webhook docs.
	 *
	 * Booking.com uses these event type strings:
	 *   - "RESERVATION_CREATED"   (uppercase, snake)
	 *   - "RESERVATION_CANCELLED" (uppercase, snake)
	 */
	static normalize(
		payload: unknown,
	): NormalizedProviderEvent | null {
		if (!isRecord(payload)) return null;
		const eventType = typeof payload.eventType === "string"
			? payload.eventType
			: typeof payload.event_type === "string"
				? payload.event_type
				: null;
		if (!eventType) return null;

		if (eventType === "RESERVATION_CREATED") {
			const data = isRecord(payload.data) ? payload.data : null;
			if (!data) return null;
			const guest = isRecord(data.guest) ? data.guest : null;
			const totalPaid = numberOrUndefined(
				data.totalAmount ?? data.total_amount,
			);
			return {
				kind: "booking.created",
				reservationId: stringOrThrow(data.id, "data.id"),
				productId: stringOrThrow(
					data.productId ?? data.product_id,
					"data.productId",
				),
				customerName: stringOrThrow(
					guest?.name ?? data.customerName,
					"guest.name",
				),
				customerEmail: stringOrThrow(
					guest?.email ?? data.customerEmail,
					"guest.email",
				),
				customerPhone: stringOrUndefined(guest?.phone),
				customerCountry: stringOrUndefined(
					guest?.country ?? data.customerCountry,
				),
				tourDate: stringOrThrow(
					data.startDate ?? data.start_date,
					"data.startDate",
				),
				tourTime: stringOrUndefined(
					data.startTime ?? data.start_time,
				),
				guests: numberOrThrow(
					data.guestCount ?? data.guest_count,
					"data.guestCount",
				),
				totalPaidCents: totalPaid !== undefined
					? BigInt(Math.round(totalPaid * 100))
					: undefined,
				currency: stringOrUndefined(data.currency),
				rawPayload: payload,
			};
		}

		if (eventType === "RESERVATION_CANCELLED") {
			const data = isRecord(payload.data) ? payload.data : null;
			const id = stringOrUndefined(data?.id);
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
	throw new Error(`Booking.com webhook: missing ${label}`);
}

function stringOrUndefined(v: unknown): string | undefined {
	if (typeof v === "string" && v.length > 0) return v;
	if (typeof v === "number") return String(v);
	return undefined;
}

function numberOrThrow(v: unknown, label: string): number {
	const n = numberOrUndefined(v);
	if (n === undefined) {
		throw new Error(`Booking.com webhook: missing ${label}`);
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

export { HttpError };