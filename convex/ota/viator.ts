// Viator OTA integration.
//
// Source: backend/ota/viator/client.py::ViatorClient.
//
// Auth: single API key sent via `expedia-api-key` header.
//       (Viator is owned by Expedia Group; the header name is an
//        artifact of that lineage and was kept verbatim per source.)
// Base URLs:
//   - production: https://api.viator.com/partner/v1
//   - sandbox:    https://api-sandbox.viator.com/partner/v1
// Webhook events:
//   - BOOKING_CREATED
//   - BOOKING_CANCELLED
// Webhook auth: HMAC-SHA256 over raw body, hex digest in
//               x-viator-signature header.
//
// Source verified webhook events list:
//   parse_webhook_event(event_type) → ("booking_created" | "booking_cancelled")

import { OTAHttpClient, HttpError } from "./http_client";
import { verifyWebhookSignature } from "./webhook_verify";
import type { DecryptedCredentials, NormalizedProviderEvent } from "./types";

const PROD_BASE_URL = "https://api.viator.com/partner/v1";
const SANDBOX_BASE_URL = "https://api-sandbox.viator.com/partner/v1";

export interface ViatorOptions {
	credentials: DecryptedCredentials;
	isSandbox: boolean;
	timeoutMs?: number;
}

export class ViatorClient {
	private readonly client: OTAHttpClient;

	constructor(opts: ViatorOptions) {
		if (!opts.credentials.apiKey) {
			throw new Error("Viator requires apiKey");
		}
		const apiKey = opts.credentials.apiKey;
		this.client = new OTAHttpClient({
			baseUrl: opts.isSandbox ? SANDBOX_BASE_URL : PROD_BASE_URL,
			getHeaders: async () => ({ "expedia-api-key": apiKey }),
			timeoutMs: opts.timeoutMs,
		});
	}

	async createProduct(product: {
		productCode: string;
		title: string;
		description?: string;
		durationMinutes?: number;
	}): Promise<{ productId: string }> {
		const res = await this.client.post<{ productId: string }>(
			"/products",
			product,
		);
		return res.body;
	}

	async updateAvailability(args: {
		productCode: string;
		startDate: string;
		endDate: string;
		availableSpaces: number;
	}): Promise<void> {
		await this.client.put(
			`/products/${encodeURIComponent(args.productCode)}/availability`,
			{
				startDate: args.startDate,
				endDate: args.endDate,
				availableSpaces: args.availableSpaces,
			},
		);
	}

	async getAvailability(args: {
		productCode: string;
		startDate: string;
		endDate: string;
	}): Promise<
		Array<{
			date: string;
			availableSpaces: number;
			totalSpaces: number;
		}>
	> {
		const res = await this.client.get<{
			availabilities: Array<{
				date: string;
				availableSpaces: number;
				totalSpaces: number;
			}>;
		}>(
			`/products/${encodeURIComponent(args.productCode)}/availability`,
			{
				startDate: args.startDate,
				endDate: args.endDate,
			},
		);
		return res.body.availabilities ?? [];
	}

	async getBookings(args: {
		startDate: string;
		endDate: string;
		status?: "CONFIRMED" | "CANCELLED";
	}): Promise<unknown[]> {
		const res = await this.client.get<{ bookings: unknown[] }>(
			"/bookings",
			args,
		);
		return res.body.bookings ?? [];
	}

	static async verifyWebhook(
		payload: string | Buffer,
		signature: string,
		secret: string,
	): Promise<boolean> {
		return await verifyWebhookSignature(payload, signature, secret);
	}

	/**
	 * Normalize a Viator webhook payload into a NormalizedProviderEvent.
	 * Returns null if the event type is unknown.
	 *
	 * Source's viator/client.py::parse_webhook_event handles:
	 *   "BOOKING_CREATED" → booking.created
	 *   "BOOKING_CANCELLED" → booking.cancelled
	 * Unknown event types are logged + ignored (matches source).
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

		if (eventType === "BOOKING_CREATED") {
			const reservation = isRecord(payload.reservation)
				? payload.reservation
				: isRecord(payload.booking)
					? payload.booking
					: null;
			if (!reservation) return null;
			const customer = isRecord(reservation.customer)
				? reservation.customer
				: null;
			const tour = isRecord(reservation.tour)
				? reservation.tour
				: null;
			const totalPaid = numberOrUndefined(
				reservation.totalPaid ?? reservation.total_paid,
			);
			return {
				kind: "booking.created",
				reservationId: stringOrThrow(
					reservation.id ?? reservation.reservationId,
					"reservation.id",
				),
				productId: stringOrThrow(
					reservation.productCode ??
						reservation.product_code ??
						reservation.productId,
					"reservation.productCode",
				),
				customerName: stringOrThrow(
					customer?.name ?? reservation.customerName,
					"customer.name",
				),
				customerEmail: stringOrThrow(
					customer?.email ?? reservation.customerEmail,
					"customer.email",
				),
				customerPhone: stringOrUndefined(customer?.phone),
				customerCountry: stringOrUndefined(
					customer?.country ?? reservation.customerCountry,
				),
				tourDate: stringOrThrow(
					tour?.date ?? reservation.tourDate,
					"tour.date",
				),
				tourTime: stringOrUndefined(tour?.time ?? reservation.tourTime),
				guests: numberOrThrow(
					reservation.guests ?? reservation.partySize,
					"reservation.guests",
				),
				totalPaidCents: totalPaid !== undefined
					? BigInt(Math.round(totalPaid * 100))
					: undefined,
				currency: stringOrUndefined(
					reservation.currency ?? tour?.currency,
				),
				commissionRate: numberOrUndefined(reservation.commissionRate),
				commissionCents: numberOrUndefined(
					reservation.commissionAmount,
				) !== undefined
					? BigInt(
							Math.round(
								(reservation.commissionAmount as number) * 100,
							),
						)
					: undefined,
				rawPayload: payload,
			};
		}

		if (eventType === "BOOKING_CANCELLED") {
			const reservation = isRecord(payload.reservation)
				? payload.reservation
				: isRecord(payload.booking)
					? payload.booking
					: null;
			const id = stringOrUndefined(
				reservation?.id ?? reservation?.reservationId,
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
	throw new Error(`Viator webhook: missing ${label}`);
}

function stringOrUndefined(v: unknown): string | undefined {
	if (typeof v === "string" && v.length > 0) return v;
	if (typeof v === "number") return String(v);
	return undefined;
}

function numberOrThrow(v: unknown, label: string): number {
	const n = numberOrUndefined(v);
	if (n === undefined) {
		throw new Error(`Viator webhook: missing ${label}`);
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
