// Tests for status badge variant mappings.
//
// The status-styles module is the single source of truth for color
// coding across the dashboard (booking statuses, schedule statuses,
// etc.). Tests pin the mapping so a refactor doesn't silently change
// which status gets which color.

import { describe, expect, test } from "vitest";
import { STATUS_VARIANTS, statusVariant } from "../components/status-styles";

describe("statusVariant", () => {
	test("known statuses return their mapped variant", () => {
		expect(statusVariant("confirmed")).toBe("default");
		expect(statusVariant("checked_in")).toBe("secondary");
		expect(statusVariant("completed")).toBe("default");
		expect(statusVariant("pending")).toBe("outline");
		expect(statusVariant("rejected")).toBe("destructive");
	});

	test("cross-domain statuses", () => {
		// Vacation statuses
		expect(statusVariant("approved")).toBe("default");
		expect(statusVariant("rejected")).toBe("destructive");
		// Vehicle statuses
		expect(statusVariant("maintenance")).toBe("outline");
		expect(statusVariant("retired")).toBe("secondary");
		// Notification channels
		expect(statusVariant("email")).toBe("secondary");
		expect(statusVariant("sms")).toBe("default");
		expect(statusVariant("both")).toBe("outline");
	});

	test("unknown status falls back to outline", () => {
		expect(statusVariant("nonexistent_status")).toBe("outline");
	});
});

describe("STATUS_VARIANTS coverage", () => {
	test("all 16 statuses have a variant", () => {
		const expected = [
			"pending", "confirmed", "checked_in", "completed", "cancelled",
			"available", "full", "in_use", "maintenance", "retired",
			"scheduled", "approved", "rejected",
			"email", "sms", "both",
			"active", "inactive", "vip", "regular",
		];
		for (const status of expected) {
			expect(STATUS_VARIANTS).toHaveProperty(status);
		}
	});
});
