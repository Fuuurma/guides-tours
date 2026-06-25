// Round-trip tests for OTA payload normalization.
//
// For each provider: build a payload matching source's
// `_handle_*_webhook` field names exactly, run it through
// `<Client>.normalize()`, assert the resulting NormalizedProviderEvent.
//
// These tests guard against field-name drift between our port and
// reservations-automation's source-of-truth (see
// backend/tours/services/ota_webhook_service.py).

import { describe, expect, test } from "vitest";
import { GetYourGuideClient } from "../getyourguide";
import { AirbnbClient } from "../airbnb";
import { TripAdvisorClient } from "../tripadvisor";
import { KlookClient } from "../klook";
import { BookingClient } from "../booking";
import { ExpediaClient } from "../expedia";
import { ViatorClient } from "../viator";

describe("GetYourGuide.normalize", () => {
	test("booking_created matches source _handle_getyourguide_webhook", () => {
		// Source reads payload.type, data.bookingId, data.traveler.{name,email},
		// data.participants, data.totalAmount, data.tourDate, data.tourTime
		const payload = {
			type: "booking_created",
			data: {
				bookingId: "GYG-12345",
				confirmationCode: "CONF-001",
				traveler: {
					name: "Alice Smith",
					email: "alice@example.com",
					phone: "+15551234567",
				},
				participants: 3,
				totalAmount: 150.0,
				currency: "USD",
				tourDate: "2026-07-15",
				tourTime: "09:00",
			},
		};
		const ev = GetYourGuideClient.normalize(payload);
		expect(ev).not.toBeNull();
		expect(ev?.kind).toBe("booking.created");
		if (ev?.kind !== "booking.created") throw new Error();
		expect(ev.reservationId).toBe("GYG-12345");
		expect(ev.productId).toBeUndefined(); // source doesn't send activityId
		expect(ev.customerName).toBe("Alice Smith");
		expect(ev.customerEmail).toBe("alice@example.com");
		expect(ev.guests).toBe(3);
		expect(ev.totalPaidCents).toBe(15000n);
		expect(ev.currency).toBe("USD");
		expect(ev.tourDate).toBe("2026-07-15");
		expect(ev.tourTime).toBe("09:00");
	});

	test("booking_cancelled parses id from data.bookingId", () => {
		const ev = GetYourGuideClient.normalize({
			type: "booking_cancelled",
			data: { bookingId: "GYG-99999" },
		});
		expect(ev?.kind).toBe("booking.cancelled");
		if (ev?.kind !== "booking.cancelled") throw new Error();
		expect(ev.reservationId).toBe("GYG-99999");
	});

	test("returns null on unknown event type", () => {
		expect(GetYourGuideClient.normalize({ type: "something_else" })).toBeNull();
		expect(GetYourGuideClient.normalize({})).toBeNull();
		expect(GetYourGuideClient.normalize(null)).toBeNull();
		expect(GetYourGuideClient.normalize("not an object")).toBeNull();
	});
});

describe("Airbnb.normalize", () => {
	test("reservationConfirmed matches source _handle_airbnb_webhook", () => {
		// Source reads payload.event_type="reservationConfirmed",
		// data.reservation_id, data.guest.first_name, data.guest.email,
		// data.number_of_guests, data.total_price.amount (in cents),
		// data.start_date
		const payload = {
			event_type: "reservationConfirmed",
			data: {
				reservation_id: "HM-7777",
				confirmation_code: "AIR-CONF-001",
				guest: {
					first_name: "Bob",
					last_name: "Jones",
					email: "bob@example.com",
					phone: "+15559876543",
				},
				number_of_guests: 2,
				total_price: { amount: 20000, currency: "USD" },
				start_date: "2026-08-01",
			},
		};
		const ev = AirbnbClient.normalize(payload);
		expect(ev).not.toBeNull();
		expect(ev?.kind).toBe("booking.created");
		if (ev?.kind !== "booking.created") throw new Error();
		expect(ev.reservationId).toBe("HM-7777");
		expect(ev.productId).toBeUndefined(); // source doesn't send experience_id
		expect(ev.customerName).toBe("Bob Jones");
		expect(ev.customerEmail).toBe("bob@example.com");
		expect(ev.guests).toBe(2);
		// source treats total_price.amount as cents and divides by 100
		// before storing. We pass through the cents value as-is.
		expect(ev.totalPaidCents).toBe(20000n);
		expect(ev.currency).toBe("USD");
		expect(ev.tourDate).toBe("2026-08-01");
	});

	test("returns null on unknown event_type", () => {
		expect(AirbnbClient.normalize({ event_type: "something" })).toBeNull();
		expect(AirbnbClient.normalize({})).toBeNull();
	});

	test("reservationCancelled parses id", () => {
		const ev = AirbnbClient.normalize({
			event_type: "reservationCancelled",
			data: { reservation_id: "HM-8888" },
		});
		expect(ev?.kind).toBe("booking.cancelled");
	});
});

describe("TripAdvisor.normalize", () => {
	test("booking_created matches source _handle_tripadvisor_webhook", () => {
		// Source reads payload.event_type="booking_created",
		// data.booking_id, data.guest_name, data.guest_email,
		// data.guest_count, data.total_amount, data.tour_date, data.tour_time
		// All guest fields are FLAT (not nested).
		const payload = {
			event_type: "booking_created",
			data: {
				booking_id: "TA-555",
				confirmation_code: "TA-CONF-1",
				guest_name: "Carol Lee",
				guest_email: "carol@example.com",
				guest_phone: "+15550001111",
				guest_count: 4,
				total_amount: 320.0,
				currency: "USD",
				tour_date: "2026-09-10",
				tour_time: "14:00",
			},
		};
		const ev = TripAdvisorClient.normalize(payload);
		expect(ev).not.toBeNull();
		expect(ev?.kind).toBe("booking.created");
		if (ev?.kind !== "booking.created") throw new Error();
		expect(ev.reservationId).toBe("TA-555");
		expect(ev.productId).toBeUndefined(); // source doesn't send product_id
		expect(ev.customerName).toBe("Carol Lee");
		expect(ev.customerEmail).toBe("carol@example.com");
		expect(ev.guests).toBe(4);
		expect(ev.totalPaidCents).toBe(32000n);
		expect(ev.tourDate).toBe("2026-09-10");
		expect(ev.tourTime).toBe("14:00");
	});

	test("returns null on unknown event_type", () => {
		expect(TripAdvisorClient.normalize({ event_type: "other" })).toBeNull();
	});

	test("booking_cancelled parses id", () => {
		const ev = TripAdvisorClient.normalize({
			event_type: "booking_cancelled",
			data: { booking_id: "TA-666" },
		});
		expect(ev?.kind).toBe("booking.cancelled");
	});
});

describe("Klook.normalize", () => {
	test("order_created matches source _handle_klook_webhook", () => {
		// Source reads payload.event_type="order_created",
		// data.order_id, data.guest_name, data.guest_email,
		// data.quantity, data.total_price, data.tour_date, data.tour_time
		const payload = {
			event_type: "order_created",
			data: {
				order_id: "KL-1234",
				booking_id: "KL-CONF-1",
				guest_name: "Dan Kim",
				guest_email: "dan@example.com",
				guest_phone: "+15552223333",
				quantity: 5,
				total_price: 250.0,
				currency: "USD",
				tour_date: "2026-10-20",
				tour_time: "10:30",
			},
		};
		const ev = KlookClient.normalize(payload);
		expect(ev).not.toBeNull();
		expect(ev?.kind).toBe("booking.created");
		if (ev?.kind !== "booking.created") throw new Error();
		expect(ev.reservationId).toBe("KL-1234");
		expect(ev.productId).toBeUndefined(); // source doesn't send activity_id
		expect(ev.customerName).toBe("Dan Kim");
		expect(ev.customerEmail).toBe("dan@example.com");
		expect(ev.guests).toBe(5);
		expect(ev.totalPaidCents).toBe(25000n);
		expect(ev.tourDate).toBe("2026-10-20");
		expect(ev.tourTime).toBe("10:30");
	});

	test("returns null on unknown event_type", () => {
		expect(KlookClient.normalize({ event_type: "refund" })).toBeNull();
	});

	test("order_cancelled parses id", () => {
		const ev = KlookClient.normalize({
			event_type: "order_cancelled",
			data: { order_id: "KL-9999" },
		});
		expect(ev?.kind).toBe("booking.cancelled");
	});
});

describe("Booking.com.normalize", () => {
	test("RESERVATION_CREATED matches booking/client.py parse_webhook_event", () => {
		const payload = {
			eventType: "RESERVATION_CREATED",
			data: {
				id: "BK-AAA",
				productId: "BK-PROD-1",
				startDate: "2026-11-05",
				startTime: "08:00",
				guest: {
					name: "Eve Park",
					email: "eve@example.com",
					phone: "+15554445555",
				},
				guestCount: 2,
				totalAmount: 180.0,
				currency: "EUR",
			},
		};
		const ev = BookingClient.normalize(payload);
		expect(ev?.kind).toBe("booking.created");
		if (ev?.kind !== "booking.created") throw new Error();
		expect(ev.reservationId).toBe("BK-AAA");
		expect(ev.productId).toBe("BK-PROD-1");
		expect(ev.customerName).toBe("Eve Park");
		expect(ev.customerEmail).toBe("eve@example.com");
		expect(ev.guests).toBe(2);
		expect(ev.totalPaidCents).toBe(18000n);
		expect(ev.currency).toBe("EUR");
		expect(ev.tourDate).toBe("2026-11-05");
	});

	test("RESERVATION_CANCELLED parses id", () => {
		const ev = BookingClient.normalize({
			eventType: "RESERVATION_CANCELLED",
			data: { id: "BK-BBB" },
		});
		expect(ev?.kind).toBe("booking.cancelled");
	});

	test("returns null on unknown eventType", () => {
		expect(BookingClient.normalize({ eventType: "OTHER" })).toBeNull();
	});
});

describe("Expedia.normalize", () => {
	test("ITINERARY_CREATED matches expedia/client.py parse_webhook_event", () => {
		const payload = {
			eventType: "ITINERARY_CREATED",
			data: {
				id: "EX-777",
				activityId: "EX-ACT-1",
				startDate: "2026-12-01",
				startTime: "15:00",
				traveler: {
					name: "Frank Wu",
					email: "frank@example.com",
					phone: "+15556667777",
				},
				travelerCount: 6,
				totalPrice: 480.0,
				currency: "USD",
			},
		};
		const ev = ExpediaClient.normalize(payload);
		expect(ev?.kind).toBe("booking.created");
		if (ev?.kind !== "booking.created") throw new Error();
		expect(ev.reservationId).toBe("EX-777");
		expect(ev.productId).toBe("EX-ACT-1");
		expect(ev.customerName).toBe("Frank Wu");
		expect(ev.customerEmail).toBe("frank@example.com");
		expect(ev.guests).toBe(6);
		expect(ev.totalPaidCents).toBe(48000n);
		expect(ev.tourDate).toBe("2026-12-01");
	});

	test("ITINERARY_CANCELLED parses id", () => {
		const ev = ExpediaClient.normalize({
			eventType: "ITINERARY_CANCELLED",
			data: { id: "EX-888" },
		});
		expect(ev?.kind).toBe("booking.cancelled");
	});

	test("returns null on unknown eventType", () => {
		expect(ExpediaClient.normalize({ eventType: "OTHER" })).toBeNull();
	});
});

describe("Viator.normalize (regression check)", () => {
	test("BOOKING_CREATED matches viator/client.py parse_webhook_event", () => {
		const payload = {
			eventType: "BOOKING_CREATED",
			reservation: {
				id: "V-100",
				productCode: "V-PROD-1",
				customer: {
					name: "Grace Hall",
					email: "grace@example.com",
				},
				tour: {
					date: "2026-07-20",
					time: "11:00",
				},
				guests: 2,
				totalPaid: 199.99,
				commissionRate: 0.2,
				commissionAmount: 39.998,
				currency: "USD",
			},
		};
		const ev = ViatorClient.normalize(payload);
		expect(ev?.kind).toBe("booking.created");
		if (ev?.kind !== "booking.created") throw new Error();
		expect(ev.reservationId).toBe("V-100");
		expect(ev.customerName).toBe("Grace Hall");
		expect(ev.totalPaidCents).toBe(19999n);
		expect(ev.commissionRate).toBe(0.2);
		expect(ev.commissionCents).toBe(4000n);
	});
});