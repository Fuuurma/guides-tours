// Tests for status badge variant + class mappings.
//
// The status-styles module is the single source of truth for color
// coding across the dashboard (booking statuses, schedule statuses,
// etc.). Tests pin the mapping so a refactor doesn't silently change
// which status gets which color.

import { describe, expect, test } from "vitest";
import {
	STATUS_CLASSES,
	STATUS_VARIANTS,
	statusClass,
	statusVariant,
} from "../components/status-styles";

describe("statusClass", () => {
	test("known statuses return their mapped class", () => {
		expect(statusClass("pending")).toBe("bg-yellow-100 text-yellow-800");
		expect(statusClass("confirmed")).toBe("bg-green-100 text-green-800");
		expect(statusClass("checked_in")).toBe("bg-blue-100 text-blue-800");
		expect(statusClass("completed")).toBe("bg-green-100 text-green-800");
		expect(statusClass("cancelled")).toBe("bg-gray-100 text-gray-800");
	});
	test("cross-domain statuses", () => {
		// Vacation statuses
		expect(statusClass("approved")).toBe("bg-green-100 text-green-800");
		expect(statusClass("rejected")).toBe("bg-red-100 text-red-800");
		// Vehicle statuses
		expect(statusClass("maintenance")).toBe("bg-yellow-100 text-yellow-800");
		expect(statusClass("retired")).toBe("bg-gray-100 text-gray-800");
		// Notification channels
		expect(statusClass("email")).toBe("bg-blue-100 text-blue-800");
		expect(statusClass("sms")).toBe("bg-green-100 text-green-800");
		expect(statusClass("both")).toBe("bg-purple-100 text-purple-800");
	});
	test("unknown status falls back to secondary", () => {
		expect(statusClass("nonexistent_status")).toBe(
			"bg-secondary text-secondary-foreground",
		);
	});
});

describe("statusVariant", () => {
	test("known statuses return their mapped variant", () => {
		expect(statusVariant("confirmed")).toBe("default");
		expect(statusVariant("checked_in")).toBe("secondary");
		expect(statusVariant("completed")).toBe("default");
		expect(statusVariant("pending")).toBe("outline");
		expect(statusVariant("rejected")).toBe("destructive");
	});
	test("unknown status falls back to outline", () => {
		expect(statusVariant("nonexistent_status")).toBe("outline");
	});
});

describe("STATUS_CLASSES + STATUS_VARIANTS coverage", () => {
	test("every status in STATUS_CLASSES is also in STATUS_VARIANTS", () => {
		for (const status of Object.keys(STATUS_CLASSES)) {
			expect(STATUS_VARIANTS).toHaveProperty(status);
		}
	});
	test("every variant in STATUS_VARIANTS is also in STATUS_CLASSES", () => {
		for (const status of Object.keys(STATUS_VARIANTS)) {
			expect(STATUS_CLASSES).toHaveProperty(status);
		}
	});
});
