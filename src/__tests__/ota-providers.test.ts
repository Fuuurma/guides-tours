// Tests for the shared OTA provider list.
//
// ALL_PROVIDERS is the single source of truth for the OTA provider
// list. It's consumed by:
//   - /dashboard/ota       (connect/list integrations)
//   - /dashboard/bookings  (source filter chips)
//
// Tests pin the list shape (every entry has id + label) and the
// providerLabel fallback (unknown id returns the raw id rather
// than crashing).

import { describe, expect, test } from "vitest";
import { ALL_PROVIDERS, providerLabel } from "../components/ota-providers";

describe("ALL_PROVIDERS", () => {
	test("has the 7 supported OTA providers", () => {
		expect(ALL_PROVIDERS).toHaveLength(7);
	});

	test("every entry has a non-empty id and label", () => {
		for (const p of ALL_PROVIDERS) {
			expect(p.id).toBeTruthy();
			expect(p.label).toBeTruthy();
		}
	});

	test("ids are unique", () => {
		const ids = ALL_PROVIDERS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("includes the documented providers", () => {
		const ids = new Set(ALL_PROVIDERS.map((p) => p.id));
		expect(ids.has("viator")).toBe(true);
		expect(ids.has("getyourguide")).toBe(true);
		expect(ids.has("airbnb")).toBe(true);
		expect(ids.has("tripadvisor")).toBe(true);
		expect(ids.has("klook")).toBe(true);
		expect(ids.has("booking")).toBe(true);
		expect(ids.has("expedia")).toBe(true);
	});
});

describe("providerLabel", () => {
	test("returns the human label for known providers", () => {
		expect(providerLabel("viator")).toBe("Viator");
		expect(providerLabel("getyourguide")).toBe("GetYourGuide");
		expect(providerLabel("tripadvisor")).toBe("TripAdvisor");
	});

	test("falls back to the raw id for unknown providers", () => {
		expect(providerLabel("not_a_provider")).toBe("not_a_provider");
	});
});
