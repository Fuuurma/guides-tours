// Expedia Tours & Activities OTA integration.
//
// Source: backend/ota/expedia/client.py::ExpediaClient.
//
// Auth: single API key sent via `X-Expedia-API-Key` header.
// Base URLs:
//   - production: https://api.expedia.com/v1
//   - sandbox:    https://api-sandbox.expedia.com/v1
//
// NOTE: Source does NOT register a webhook handler for Expedia
// (tours/services/ota_webhook_service.py only handles Viator,
// GetYourGuide, Airbnb, TripAdvisor, Klook). We provide
// ExpediaClient.normalize + a webhook handler anyway using the
// ITINERARY_CREATED / ITINERARY_CANCELLED shape that source's
// parse_webhook_event anticipates. Expedia uses "itinerary"
// instead of "reservation" in their domain language.

import { OTAHttpClient, HttpError } from "./http_client";
import type { DecryptedCredentials, NormalizedProviderEvent } from "./types";

const PROD_BASE_URL = "https://api.expedia.com/v1";
const SANDBOX_BASE_URL = "https://api-sandbox.expedia.com/v1";

export interface ExpediaOptions {
	credentials: DecryptedCredentials;
	isSandbox: boolean;
	timeoutMs?: number;
}

export class ExpediaClient {
	private readonly client: OTAHttpClient;

	constructor(opts: ExpediaOptions) {
		if (!opts.credentials.apiKey) {
			throw new Error("Expedia requires apiKey");
		}
		const apiKey = opts.credentials.apiKey;
		this.client = new OTAHttpClient({
			baseUrl: opts.isSandbox ? SANDBOX_BASE_URL : PROD_BASE_URL,
			getHeaders: async () => ({ "X-Expedia-API-Key": apiKey }),
			timeoutMs: opts.timeoutMs,
		});
	}

	async createProduct(product: {
		title: string;
		description?: string;
		category?: string;
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
			isAvailable: boolean;
			inventory: number;
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
			"/itineraries",
			args,
		);
		return res.body.data ?? [];
	}

	/**
	 * Normalize an Expedia webhook payload.
	 *
	 * NOTE: Source does NOT register a webhook handler for Expedia.
	 * Shape is from expedia/client.py::parse_webhook_event (dead code
	 * in source) + Expedia's Partner API docs. Expedia uses the
	 * "itinerary" term in their domain language.
	 *
	 * Expedia uses these event type strings:
	 *   - "ITINERARY_CREATED"
	 *   - "ITINERARY_CANCELLED"
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

		if (eventType === "ITINERARY_CREATED") {
			const data = isRecord(payload.data) ? payload.data : null;
			if (!data) return null;
			const traveler = isRecord(data.traveler) ? data.traveler : null;
			const totalPaid = numberOrUndefined(
				data.totalPrice ?? data.total_price,
			);
			return {
				kind: "booking.created",
				reservationId: stringOrThrow(data.id, "data.id"),
				productId: stringOrThrow(
					data.activityId ?? data.activity_id,
					"data.activityId",
				),
				customerName: stringOrThrow(
					traveler?.name ?? data.customerName,
					"traveler.name",
				),
				customerEmail: stringOrThrow(
					traveler?.email ?? data.customerEmail,
					"traveler.email",
				),
				customerPhone: stringOrUndefined(traveler?.phone),
				customerCountry: stringOrUndefined(
					traveler?.country ?? data.customerCountry,
				),
				tourDate: stringOrThrow(
					data.startDate ?? data.start_date,
					"data.startDate",
				),
				tourTime: stringOrUndefined(
					data.startTime ?? data.start_time,
				),
				guests: numberOrThrow(
					data.travelerCount ?? data.traveler_count,
					"data.travelerCount",
				),
				totalPaidCents: totalPaid !== undefined
					? BigInt(Math.round(totalPaid * 100))
					: undefined,
				currency: stringOrUndefined(data.currency),
				rawPayload: payload,
			};
		}

		if (eventType === "ITINERARY_CANCELLED") {
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
	throw new Error(`Expedia webhook: missing ${label}`);
}

function stringOrUndefined(v: unknown): string | undefined {
	if (typeof v === "string" && v.length > 0) return v;
	if (typeof v === "number") return String(v);
	return undefined;
}

function numberOrThrow(v: unknown, label: string): number {
	const n = numberOrUndefined(v);
	if (n === undefined) {
		throw new Error(`Expedia webhook: missing ${label}`);
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