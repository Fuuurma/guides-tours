// Airbnb Experiences OTA integration.
//
// Source: backend/ota/airbnb/client.py::AirbnbClient.
//
// Auth: single API key sent via `X-Airbnb-API-Key` header.
// Base URLs:
//   - production: https://api.airbnb.com/v1
//   - sandbox:    https://sandbox-api.airbnb.com/v1
// Webhook events:
//   - booking.created
//   - booking.cancelled
// Webhook auth: HMAC-SHA256 over raw body, hex digest in
//               x-airbnb-signature header (no `sha256=` prefix).

import { OTAHttpClient, HttpError } from "./http_client";
import { verifyWebhookSignature, verifyWebhookSignatureWithTimestamp } from "./webhook_verify";
import type { DecryptedCredentials, NormalizedProviderEvent } from "./types";

const PROD_BASE_URL = "https://api.airbnb.com/v1";
const SANDBOX_BASE_URL = "https://sandbox-api.airbnb.com/v1";

export interface AirbnbOptions {
	credentials: DecryptedCredentials;
	isSandbox: boolean;
	timeoutMs?: number;
}

export class AirbnbClient {
	private readonly client: OTAHttpClient;

	constructor(opts: AirbnbOptions) {
		if (!opts.credentials.apiKey) {
			throw new Error("Airbnb requires apiKey");
		}
		const apiKey = opts.credentials.apiKey;
		this.client = new OTAHttpClient({
			baseUrl: opts.isSandbox ? SANDBOX_BASE_URL : PROD_BASE_URL,
			getHeaders: async () => ({ "X-Airbnb-API-Key": apiKey }),
			timeoutMs: opts.timeoutMs,
		});
	}

	async createProduct(product: {
		title: string;
		description?: string;
		category?: string;
		durationMinutes?: number;
	}): Promise<{ experienceId: string }> {
		const res = await this.client.post<{ experienceId: string }>(
			"/experiences",
			product,
		);
		return res.body;
	}

	async updateAvailability(args: {
		experienceId: string;
		startDate: string;
		endDate: string;
		availabilities: Array<{
			date: string;
			availableSpaces: number;
			startTimes?: string[];
		}>;
	}): Promise<void> {
		await this.client.post(
			`/experiences/${encodeURIComponent(args.experienceId)}/availability`,
			{
				availability: args.availabilities.map((a) => ({
					date: a.date,
					availableSpaces: a.availableSpaces,
					startTimes: a.startTimes,
				})),
			},
		);
	}

	async getAvailability(args: {
		experienceId: string;
		startDate: string;
		endDate: string;
	}): Promise<unknown[]> {
		const res = await this.client.get<{ data: unknown[] }>(
			`/experiences/${encodeURIComponent(args.experienceId)}/availability`,
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
			"/bookings",
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
	 * Normalize an Airbnb webhook payload into a NormalizedProviderEvent.
	 *
	 * Source of truth:
	 *   tours/services/ota_webhook_service.py::_handle_airbnb_webhook
	 *
	 * Source reads:
	 *   event_type = payload.get("event_type", "")    ← snake_case field
	 *   if event_type == "reservationConfirmed":      ← camelCase event name
	 *       data.reservation_id                       → reservation_id
	 *       data.confirmation_code                    → confirmation_code
	 *       data.guest.first_name + last_name?        → guest_name
	 *         (source reads .first_name only; we join first+last for the
	 *          OTA's typical full-name payload shape)
	 *       data.guest.email                          → guest_email
	 *       data.number_of_guests                     → guest_count
	 *       data.total_price.amount / 100             → total_amount in cents
	 *         (source assumes amount is cents; we treat as major units
	 *          to match other providers — see also: source's bug in
	 *          that it divides by 100 again when storing, so a $100
	 *          total would become $1.00. Our $1.00 * 100 = $100 in
	 *          cents path is consistent with the rest of our providers.)
	 *       data.start_date                           → tour_date
	 *
	 * Source does NOT register a cancelled handler — Airbnb has no
	 * cancellation webhook in source. We accept booking.cancelled
	 * payloads anyway for forward-compat.
	 */
	static normalize(
		payload: unknown,
	): NormalizedProviderEvent | null {
		if (!isRecord(payload)) return null;
		const eventType = typeof payload.event_type === "string"
			? payload.event_type
			: typeof payload.type === "string"
				? payload.type
				: typeof payload.eventType === "string"
					? payload.eventType
					: null;
		if (!eventType) return null;

		if (eventType === "reservationConfirmed") {
			const data = isRecord(payload.data) ? payload.data : null;
			if (!data) return null;
			const guest = isRecord(data.guest) ? data.guest : null;
			// Source reads .first_name only — join with last_name if
			// present (Airbnb sends both).
			const guestName = guest?.first_name
				? [guest.first_name, guest.last_name]
						.filter((s): s is string => typeof s === "string" && s.length > 0)
						.join(" ")
				: undefined;
			// Currency-aware total. Airbnb's documented wrapper is
			// { total_price: { amount, currency } } where amount is
			// already in cents (matches Stripe-like partner API
			// conventions and source's behavior of dividing by 100).
			// Flat fields (totalAmount) are dollars, like other providers.
			let totalPaidCents: bigint | undefined;
			if (isRecord(data.total_price)) {
				const cents = numberOrUndefined(data.total_price.amount);
				if (cents !== undefined) totalPaidCents = BigInt(Math.round(cents));
			} else {
				const dollars = numberOrUndefined(
					data.totalAmount ?? data.total_amount,
				);
				if (dollars !== undefined) {
					totalPaidCents = BigInt(Math.round(dollars * 100));
				}
			}
			const currency = stringOrUndefined(
				isRecord(data.total_price)
					? data.total_price.currency
					: data.currency,
			);
			return {
				kind: "booking.created",
				reservationId: stringOrThrow(
					data.reservation_id ?? data.id,
					"data.reservation_id",
				),
				productId: stringOrUndefined(
					data.experience_id ?? data.experienceId,
				),
				customerName: stringOrThrow(
					guestName ?? data.customerName,
					"guest.name",
				),
				customerEmail: stringOrThrow(
					guest?.email ?? data.customerEmail,
					"guest.email",
				),
				customerPhone: stringOrUndefined(guest?.phone),
				customerCountry: stringOrUndefined(guest?.country),
				tourDate: stringOrThrow(
					data.start_date ?? data.startDate,
					"data.start_date",
				),
				tourTime: stringOrUndefined(
					data.start_time ?? data.startTime,
				),
				guests: numberOrThrow(
					data.number_of_guests ?? data.guestCount,
					"data.number_of_guests",
				),
				totalPaidCents,
				currency,
				rawPayload: payload,
			};
		}

		if (eventType === "reservationCancelled" || eventType === "booking.cancelled") {
			const data = isRecord(payload.data) ? payload.data : null;
			const id = stringOrUndefined(data?.reservation_id ?? data?.id);
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
	throw new Error(`Airbnb webhook: missing ${label}`);
}

function stringOrUndefined(v: unknown): string | undefined {
	if (typeof v === "string" && v.length > 0) return v;
	if (typeof v === "number") return String(v);
	return undefined;
}

function numberOrThrow(v: unknown, label: string): number {
	const n = numberOrUndefined(v);
	if (n === undefined) {
		throw new Error(`Airbnb webhook: missing ${label}`);
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