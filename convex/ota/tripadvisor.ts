// TripAdvisor Experiences OTA integration.
//
// Source: backend/ota/tripadvisor/client.py::TripAdvisorClient.
//
// Auth: `X-TA-Partner-ID` + `X-TA-API-Key` headers.
// Base URLs:
//   - production: https://api.tripadvisor.com/v1
//   - sandbox:    https://api-sandbox.tripadvisor.com/v1
// Webhook events:
//   - RESERVATION_CREATED
//   - RESERVATION_CANCELLED
// Webhook auth: HMAC-SHA256 over raw body, hex digest in
//               x-tripadvisor-signature header.

import { OTAHttpClient, HttpError } from "./http_client";
import { verifyWebhookSignature, verifyWebhookSignatureWithTimestamp } from "./webhook_verify";
import type { DecryptedCredentials, NormalizedProviderEvent } from "./types";

const PROD_BASE_URL = "https://api.tripadvisor.com/v1";
const SANDBOX_BASE_URL = "https://api-sandbox.tripadvisor.com/v1";

export interface TripAdvisorOptions {
	credentials: DecryptedCredentials;
	isSandbox: boolean;
	timeoutMs?: number;
}

export class TripAdvisorClient {
	private readonly client: OTAHttpClient;

	constructor(opts: TripAdvisorOptions) {
		if (!opts.credentials.apiKey) {
			throw new Error("TripAdvisor requires apiKey");
		}
		if (!opts.credentials.partnerId) {
			throw new Error("TripAdvisor requires partnerId");
		}
		const apiKey = opts.credentials.apiKey;
		const partnerId = opts.credentials.partnerId;
		this.client = new OTAHttpClient({
			baseUrl: opts.isSandbox ? SANDBOX_BASE_URL : PROD_BASE_URL,
			getHeaders: async () => ({
				"X-TA-API-Key": apiKey,
				"X-TA-Partner-ID": partnerId,
			}),
			timeoutMs: opts.timeoutMs,
		});
	}

	async createProduct(product: {
		title: string;
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
			price?: number;
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

	static async verifyWebhook(
		payload: string | Buffer,
		signature: string,
		secret: string,
	): Promise<boolean> {
		return await verifyWebhookSignature(payload, signature, secret);
	}

	static async verifyWebhookWithTimestamp(
		payload: string | Buffer,
		signature: string,
		timestampHeader: string | null,
		secret: string,
		nowMs?: number,
	) {
		return await verifyWebhookSignatureWithTimestamp(
			payload,
			signature,
			timestampHeader,
			secret,
			nowMs,
		);
	}

	/**
	 * Normalize a TripAdvisor webhook payload.
	 *
	 * Source of truth:
	 *   tours/services/ota_webhook_service.py::_handle_tripadvisor_webhook
	 *
	 * Source reads:
	 *   event_type = payload.get("event_type", "")    ← snake_case field
	 *   if event_type == "booking_created":           ← lowercase snake
	 *       data.booking_id                           → reservation_id
	 *       data.confirmation_code                    → confirmation_code
	 *       data.guest_name, data.guest_email         ← FLAT (not nested)
	 *       data.guest_count                          → guest_count
	 *       data.total_amount                         → total_amount
	 *       data.tour_date, data.tour_time
	 *
	 * Source does NOT register a cancelled handler.
	 */
	static normalize(
		payload: unknown,
	): NormalizedProviderEvent | null {
		if (!isRecord(payload)) return null;
		const eventType = typeof payload.event_type === "string"
			? payload.event_type
			: typeof payload.eventType === "string"
				? payload.eventType
				: null;
		if (!eventType) return null;

		if (eventType === "booking_created") {
			const data = isRecord(payload.data) ? payload.data : null;
			if (!data) return null;
			const totalPaid = numberOrUndefined(
				data.total_amount ?? data.totalAmount,
			);
			return {
				kind: "booking.created",
				reservationId: stringOrThrow(
					data.booking_id ?? data.id,
					"data.booking_id",
				),
				productId: stringOrUndefined(
					data.product_id ?? data.productId,
				),
				customerName: stringOrThrow(
					data.guest_name ?? data.customerName,
					"data.guest_name",
				),
				customerEmail: stringOrThrow(
					data.guest_email ?? data.customerEmail,
					"data.guest_email",
				),
				customerPhone: stringOrUndefined(
					data.guest_phone ?? data.customerPhone,
				),
				customerCountry: stringOrUndefined(
					data.guest_country ?? data.customerCountry,
				),
				tourDate: stringOrThrow(
					data.tour_date ?? data.tourDate,
					"data.tour_date",
				),
				tourTime: stringOrUndefined(
					data.tour_time ?? data.tourTime,
				),
				guests: numberOrThrow(
					data.guest_count ?? data.guestCount,
					"data.guest_count",
				),
				totalPaidCents: totalPaid !== undefined
					? BigInt(Math.round(totalPaid * 100))
					: undefined,
				currency: stringOrUndefined(data.currency),
				rawPayload: payload,
			};
		}

		if (eventType === "booking_cancelled" || eventType === "reservation_cancelled") {
			const data = isRecord(payload.data) ? payload.data : null;
			const id = stringOrUndefined(data?.booking_id ?? data?.id);
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
	throw new Error(`TripAdvisor webhook: missing ${label}`);
}

function stringOrUndefined(v: unknown): string | undefined {
	if (typeof v === "string" && v.length > 0) return v;
	if (typeof v === "number") return String(v);
	return undefined;
}

function numberOrThrow(v: unknown, label: string): number {
	const n = numberOrUndefined(v);
	if (n === undefined) {
		throw new Error(`TripAdvisor webhook: missing ${label}`);
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