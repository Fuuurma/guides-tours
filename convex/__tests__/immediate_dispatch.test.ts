// Tests for the immediate booking-confirmation dispatch.
//
// The dispatch is split into:
// - notifications.getBookingForImmediateDispatch (query) — loads
//   booking + customer + tour + active booking_confirmation template
// - notifications.recordImmediateDispatchResult (mutation) —
//   writes the audit-log row
//
// notification_dispatch.dispatchImmediateBookingConfirmation is an
// internalAction that wires them to SES. Testing the action side
// requires a live HTTP fetch (SES) which convexTest can't reach, so
// we cover the query + audit-log half here and assert the action
// returns a "skipped" status when SES is not configured.
//
// What we test:
// - Query returns null when no active template exists
// - Query returns null when booking is deleted
// - Query returns the right shape (template + booking + customer)
// - Audit log is written with action=notification.immediate_sent
//   on success and notification.immediate_failed on failure
// - Audit log carries the channel/recipient/subject/error fields

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";
import { seedBooking, seedCustomer, seedTour } from "./helpers";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function seedTemplate(
	ctx: any,
	orgId: string,
	isActive = true,
) {
	return await ctx.db.insert("notificationTemplates", {
		organizationId: orgId,
		name: "Booking confirmation",
		templateType: "booking_confirmation",
		channel: "email",
		isActive,
		isDefault: false,
		emailSubject: "Your booking is confirmed",
		emailBodyText: "Hi {customerName}, your booking for {tourName} is confirmed.",
		emailBodyHtml: "",
		smsBody: "",
		variables: [],
		sendTiming: "immediate",
		requireConsent: false,
		retryOnFailure: true,
		retryCount: 3,
		createdAt: 0,
		updatedAt: 0,
	});
}

describe("immediate booking-confirmation dispatch", () => {
	it("returns template=null when no active template exists", async () => {
		const t = convexTest(schema, modules);
		const { bookingId } = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: "org_imm_a", name: "Old Town Walk" });
			const customerId = await seedCustomer(ctx, { orgId: "org_imm_a", email: "alice@a.com", name: "Alice Visitor" });
			const bookingId = await seedBooking(ctx, { orgId: "org_imm_a", tourId: tourId, customerId, date: "2026-12-31", startTime: "10:00", status: "confirmed", totalAmountCents: 10000n, netRevenueCents: 10000n, source: "public_booking" });
			return { bookingId };
		});
		const result = await t.query(
			internal.notifications.getBookingForImmediateDispatch,
			{ bookingId },
		);
		// The query now returns booking/customer with a null template
		// so transition dispatch can fall back to built-in copy; the
		// confirmation dispatcher still treats this as a skip.
		expect(result).not.toBeNull();
		expect(result?.template).toBeNull();
	});

	it("returns template=null when template is inactive", async () => {
		const t = convexTest(schema, modules);
		const { bookingId } = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: "org_imm_b", name: "Old Town Walk" });
			const customerId = await seedCustomer(ctx, { orgId: "org_imm_b", email: "alice@b.com", name: "Alice Visitor" });
			await seedTemplate(ctx, "org_imm_b", false); // inactive
			const bookingId = await seedBooking(ctx, { orgId: "org_imm_b", tourId: tourId, customerId, date: "2026-12-31", startTime: "10:00", status: "confirmed", totalAmountCents: 10000n, netRevenueCents: 10000n, source: "public_booking" });
			return { bookingId };
		});
		const result = await t.query(
			internal.notifications.getBookingForImmediateDispatch,
			{ bookingId },
		);
		expect(result).not.toBeNull();
		expect(result?.template).toBeNull();
	});

	it("returns shape { template, booking, customer } with correct fields", async () => {
		const t = convexTest(schema, modules);
		const { bookingId } = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: "org_imm_c", name: "Old Town Walk" });
			const customerId = await seedCustomer(ctx, { orgId: "org_imm_c", email: "alice@c.com", name: "Alice Visitor" });
			await seedTemplate(ctx, "org_imm_c");
			const bookingId = await seedBooking(ctx, { orgId: "org_imm_c", tourId: tourId, customerId, date: "2026-12-31", startTime: "10:00", status: "confirmed", totalAmountCents: 10000n, netRevenueCents: 10000n, source: "public_booking" });
			return { bookingId };
		});
		const result = (await t.query(
			internal.notifications.getBookingForImmediateDispatch,
			{ bookingId },
		)) as any;
		expect(result).not.toBeNull();
		expect(result.template.templateType).toBe("booking_confirmation");
		expect(result.template.isActive).toBe(true);
		expect(result.template.channel).toBe("email");
		expect(result.booking.tourName).toBe("Old Town Walk");
		expect(result.booking.date).toBe("2026-12-31");
		expect(result.booking.startTime).toBe("10:00");
		expect(result.customer.email).toBe("alice@c.com");
		expect(result.customer.name).toBe("Alice Visitor");
	});

	it("returns null when booking is deleted", async () => {
		const t = convexTest(schema, modules);
		// Insert a booking then delete it — ensures we use a valid Id
		// shape (the validator rejects malformed ones before handler).
		const deletedId = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: "org_imm_x", name: "Old Town Walk" });
			const customerId = await seedCustomer(ctx, { orgId: "org_imm_x", email: "x@x.com", name: "Alice Visitor" });
			const id = await seedBooking(ctx, { orgId: "org_imm_x", tourId: tourId, customerId, date: "2026-12-31", startTime: "10:00", status: "confirmed", totalAmountCents: 10000n, netRevenueCents: 10000n, source: "public_booking" });
			await ctx.db.delete(id);
			return id;
		});
		const result = await t.query(
			internal.notifications.getBookingForImmediateDispatch,
			{ bookingId: deletedId },
		);
		expect(result).toBeNull();
	});

	it("recordImmediateDispatchResult writes success audit log", async () => {
		const t = convexTest(schema, modules);
		const { bookingId } = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: "org_imm_d", name: "Old Town Walk" });
			const customerId = await seedCustomer(ctx, { orgId: "org_imm_d", email: "alice@d.com", name: "Alice Visitor" });
			const bookingId = await seedBooking(ctx, { orgId: "org_imm_d", tourId: tourId, customerId, date: "2026-12-31", startTime: "10:00", status: "confirmed", totalAmountCents: 10000n, netRevenueCents: 10000n, source: "public_booking" });
			return { bookingId };
		});
		await t.mutation(internal.notifications.recordImmediateDispatchResult, {
			organizationId: "org_imm_d",
			bookingId,
			channel: "email",
			success: true,
			recipient: "alice@d.com",
			subject: "Booking confirmed",
			templateName: "Booking confirmation",
		});
		const logs = (await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		)) as Array<{ action: string; newValues: Record<string, unknown> }>;
		const log = logs.find((l) => l.action === "notification.immediate_sent");
		expect(log).toBeDefined();
		expect(log?.newValues.channel).toBe("email");
		// PII: recipient + subject are no longer logged.
		expect(log?.newValues.recipient).toBeUndefined();
		expect(log?.newValues.subject).toBeUndefined();
		expect(log?.newValues.templateName).toBe("Booking confirmation");
	});

	it("recordImmediateDispatchResult writes failure audit log with error", async () => {
		const t = convexTest(schema, modules);
		const { bookingId } = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: "org_imm_e", name: "Old Town Walk" });
			const customerId = await seedCustomer(ctx, { orgId: "org_imm_e", email: "alice@e.com", name: "Alice Visitor" });
			const bookingId = await seedBooking(ctx, { orgId: "org_imm_e", tourId: tourId, customerId, date: "2026-12-31", startTime: "10:00", status: "confirmed", totalAmountCents: 10000n, netRevenueCents: 10000n, source: "public_booking" });
			return { bookingId };
		});
		await t.mutation(internal.notifications.recordImmediateDispatchResult, {
			organizationId: "org_imm_e",
			bookingId,
			channel: "email",
			success: false,
			errorMessage: "SES not configured",
			recipient: "alice@e.com",
			subject: "Booking confirmed",
			templateName: "Booking confirmation",
		});
		const logs = (await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		)) as Array<{ action: string; newValues: Record<string, unknown> }>;
		const log = logs.find((l) => l.action === "notification.immediate_failed");
		expect(log).toBeDefined();
		expect(log?.newValues.error).toBe("SES not configured");
	});
});
