// Klook OTA integration.
//
// Source: backend/ota/klook/client.py::KlookClient.
//
// Auth: single API key sent via `X-Klook-API-Key` header.
// Base URLs:
//   - production: https://api.klook.com/v1
//   - sandbox:    https://sandbox-api.klook.com/v1
// Webhook events:
//   - ORDER_CREATED
//   - ORDER_CANCELLED
// Webhook auth: HMAC-SHA256 over raw body, hex digest in
//               x-klook-signature header.

import { OTAHttpClient, HttpError } from "./http_client";
import { verifyWebhookSignature } from "./webhook_verify";
import type { DecryptedCredentials, NormalizedProviderEvent } from "./types";

const PROD_BASE_URL = "https://api.klook.com/v1";
const SANDBOX_BASE_URL = "https://sandbox-api.klook.com/v1";

export interface KlookOptions {
	credentials: DecryptedCredentials;
	isSandbox: boolean;
	timeoutMs?: number;
}

export class KlookClient {
	private readonly client: OTAHttpClient;

	constructor(opts: KlookOptions) {
		if (!opts.credentials.apiKey) {
			throw new Error("Klook requires apiKey");
		}
		const apiKey = opts.credentials.apiKey;
		this.client = new OTAHttpClient({
			baseUrl: opts.isSandbox ? SANDBOX_BASE_URL : PROD_BASE_URL,
			getHeaders: async () => ({ "X-Klook-API-Key": apiKey }),
			timeoutMs: opts.timeoutMs,
		});
	}

	async createProduct(product: {
		title: string;
		description?: string;
		categoryId?: string;
		durationMinutes?: number;
	}): Promise<{ activityId: string }> {
		const res = await this.client.post<{ activityId: string }>(
			"/activities",
			product,
		);
		return res.body;
	}

	async updateAvailability(args: {
		activityId: string;
		inventoryUpdates: Array<{
			date: string;
			inventory: number;
			price?: number;
		}>;
	}): Promise<void> {
		await this.client.post(
			`/activities/${encodeURIComponent(args.activityId)}/inventory`,
			{ inventoryUpdates: args.inventoryUpdates },
		);
	}

	async getAvailability(args: {
		activityId: string;
		startDate: string;
		endDate: string;
	}): Promise<unknown[]> {
		const res = await this.client.get<{ data: unknown[] }>(
			`/activities/${encodeURIComponent(args.activityId)}/inventory`,
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
			"/orders",
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

	/**
	 * Normalize a Klook webhook payload.
	 *
	 * Source of truth:
	 *   tours/services/ota_webhook_service.py::_handle_klook_webhook
	 *
	 * Source reads:
	 *   event_type = payload.get("event_type", "")    ← snake_case field
	 *   if event_type == "order_created":              ← lowercase snake
	 *       data.order_id                              → reservation_id
	 *       data.booking_id                            → confirmation_code
	 *       data.guest_name, data.guest_email          ← FLAT
	 *       data.quantity                              → guest_count
	 *       data.total_price                           → total_amount
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

		if (eventType === "order_created") {
			const data = isRecord(payload.data) ? payload.data : null;
			if (!data) return null;
			const totalPaid = numberOrUndefined(
				data.total_price ?? data.totalAmount,
			);
			return {
				kind: "booking.created",
				reservationId: stringOrThrow(
					data.order_id ?? data.orderId ?? data.id,
					"data.order_id",
				),
				productId: stringOrUndefined(
					data.activity_id ?? data.activityId,
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
					data.quantity ?? data.guestCount,
					"data.quantity",
				),
				totalPaidCents: totalPaid !== undefined
					? BigInt(Math.round(totalPaid * 100))
					: undefined,
				currency: stringOrUndefined(data.currency),
				rawPayload: payload,
			};
		}

		if (eventType === "order_cancelled" || eventType === "order_canceled") {
			const data = isRecord(payload.data) ? payload.data : null;
			const id = stringOrUndefined(
				data?.order_id ?? data?.orderId ?? data?.id,
			);
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
	throw new Error(`Klook webhook: missing ${label}`);
}

function stringOrUndefined(v: unknown): string | undefined {
	if (typeof v === "string" && v.length > 0) return v;
	if (typeof v === "number") return String(v);
	return undefined;
}

function numberOrThrow(v: unknown, label: string): number {
	const n = numberOrUndefined(v);
	if (n === undefined) {
		throw new Error(`Klook webhook: missing ${label}`);
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