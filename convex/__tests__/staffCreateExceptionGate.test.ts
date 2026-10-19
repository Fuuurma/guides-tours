// F878 — staff create gates exception dates like blackouts.
//
// bookings.create checked isBlackoutHelper but never
// exceptionForDateHelper: a "removed" exception date stayed
// staff-bookable (update at bookingsLifecycle + the public path both
// refuse it), and a modified exception's capacityOverride never capped
// the attached slot, so a phone booking could oversell an
// operator-capped date.
//
// requireMembership needs a Better Auth session convex-test cannot
// provide (see customers.test.ts header), so the gate follows the
// house shape for auth-blocked paths: the DECISION is a pure exported
// function (behaviourally pinned below), and a structural pin asserts
// the create handler actually wires the reads + gate (the
// bookingsListCustomerName idiom).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
	staffCreateExceptionRefusal,
	type StaffCreateExceptionRefusal,
} from "../lib/bookingsLifecycle";

const REMOVED = { exceptionType: "removed" };
const MODIFIED_CAPPED = { exceptionType: "modified", capacityOverride: 4 };

describe("staffCreateExceptionRefusal (F878)", () => {
	it("refuses a removed exception date with the house copy", () => {
		expect(staffCreateExceptionRefusal(REMOVED, { guests: 2 })).toEqual({
			message:
				"This date is not available for booking. Please pick another date.",
		} satisfies StaffCreateExceptionRefusal);
	});

	it("refuses a removed date even when a schedule is attached", () => {
		expect(
			staffCreateExceptionRefusal(REMOVED, {
				scheduleId: "sched_1" as never,
				guests: 2,
				attachedCapacityBooked: 0,
			})?.message,
		).toContain("not available");
	});

	it("refuses an oversell of a capped attached slot", () => {
		expect(
			staffCreateExceptionRefusal(MODIFIED_CAPPED, {
				scheduleId: "sched_1" as never,
				guests: 3,
				attachedCapacityBooked: 2,
			}),
		).toEqual({
			message: "Not enough seats left for this tour slot",
		} satisfies StaffCreateExceptionRefusal);
	});

	it("allows a capped attached slot with room", () => {
		expect(
			staffCreateExceptionRefusal(MODIFIED_CAPPED, {
				scheduleId: "sched_1" as never,
				guests: 2,
				attachedCapacityBooked: 2,
			}),
		).toBeNull();
	});

	it("keeps staff latitude on an unattached capped date", () => {
		// Scope note: the row asks for the removed-refusal + the attached
		// override precheck. A staff booking with no concrete slot is the
		// operator's own phone sale — the public path's blanket refusal
		// (public_booking GT-AUDIT-02) is deliberately not ported here.
		expect(
			staffCreateExceptionRefusal(MODIFIED_CAPPED, { guests: 8 }),
		).toBeNull();
	});

	it("allows a plain date untouched", () => {
		expect(
			staffCreateExceptionRefusal(null, {
				scheduleId: "sched_1" as never,
				guests: 5,
				attachedCapacityBooked: 4,
			}),
		).toBeNull();
	});
});

describe("bookings.create wires the exception gate (F878, structural)", () => {
	const bookingsSrc = readFileSync(
		new URL("../bookings.ts", import.meta.url),
		"utf8",
	);

	it("create reads the exception and applies the gate after the blackout check", () => {
		const start = bookingsSrc.indexOf("export const create = mutation({");
		expect(start, "bookings.create not found").toBeGreaterThan(-1);
		const handler = bookingsSrc.slice(
			start,
			bookingsSrc.indexOf("export const ", start + 10),
		);
		expect(handler).toContain("exceptionForDateHelper(");
		expect(handler).toContain("member.organizationId");
		expect(handler).toContain("staffCreateExceptionRefusal(");
		// The gate must sit after the blackout check so the refusal order
		// matches update + public (blackout first, then exceptions).
		const blackout = handler.indexOf("isBlackoutHelper");
		const gate = handler.indexOf("staffCreateExceptionRefusal(");
		expect(blackout).toBeGreaterThan(-1);
		expect(gate).toBeGreaterThan(blackout);
	});
});
