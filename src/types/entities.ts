// Shared entity types for the dashboard.
//
// These mirror the shape of the Convex query return values (not the
// raw table schema). Queries often return computed/joined fields, so
// the types here are slightly larger than the underlying table.
//
// Pages should import these instead of defining inline interfaces
// that can drift from the actual query shape. For pages that only
// need a subset, use Pick<Entity, "field1" | "field2">.

export type BookingStatus =
	| "pending"
	| "confirmed"
	| "checked_in"
	| "completed"
	| "cancelled";

export type VehicleStatus = "available" | "in_use" | "maintenance" | "retired";

export type VacationStatus = "pending" | "approved" | "rejected";

export interface Booking {
	_id: string;
	date: string;
	startTime: string;
	guests: number;
	status: BookingStatus;
	source: string;
	totalAmountCents: bigint | number;
}

export interface BookingDetail extends Booking {
	depositAmountCents: bigint | number;
	balanceDueCents: bigint | number;
	netRevenueCents: bigint | number;
	paymentMethod: string;
	guestNames: string;
	notes: string;
	reviewRating: number | null;
	reviewComment: string;
	checkedInAt: number | null;
	checkedInBy: string;
	completedAt: number | null;
	tour: { _id: string; name: string } | null;
	customer: { _id: string; name: string; email: string } | null;
}

export interface Tour {
	_id: string;
	name: string;
	tourType: string;
	durationHours: number;
	minGuests: number;
	maxGuests: number;
	isActive: boolean;
}

export interface Customer {
	_id: string;
	name: string;
	email: string;
	phone: string;
	vipStatus: boolean;
	source: string;
	totalVisits: number;
}

export interface CustomerDetail extends Customer {
	preferredLanguage: string;
	totalRevenueCents: bigint | number;
	loyaltyPoints: number;
	tags: string[];
}

export interface Driver {
	_id: string;
	userId: string;
	licenseInfo: string;
	isActive: boolean;
}

export interface Vehicle {
	_id: string;
	name: string;
	vehicleType: string;
	licensePlate: string;
	capacity: number;
	status: VehicleStatus;
}

export interface Schedule {
	_id: string;
	date: string;
	startTime: string;
	endTime: string;
	capacityBooked: number;
	capacityTotal: number;
	status: "available" | "full" | "cancelled";
	tourId: string;
}

export interface Assignment {
	_id: string;
	date: string;
	startTime: string;
	endTime?: string;
	guideId: string;
	tourId: string;
	status: "scheduled" | "completed" | "cancelled";
}

export interface Vacation {
	_id: string;
	userId: string;
	startDate: string;
	endDate: string;
	reason: string;
	status: VacationStatus;
}

export interface NotificationTemplate {
	_id: string;
	name: string;
	templateType: string;
	channel: string;
	emailSubject: string;
	isActive: boolean;
	sendTiming: string;
	retryCount: number;
}

export interface TourTemplate {
	_id: string;
	name: string;
	tourType: string;
	durationHours: number;
	capacity: number;
	isActive: boolean;
}
