/**
 * edit-booking validation — extracted submit rules for EditBookingForm.
 *
 * Regression guard (work:787/t-6654dce06f): the onSubmit checks and the
 * update payload builder moved here verbatim so the giant form component
 * could be split; these pins lock the exact messages and parsing.
 */
import { describe, expect, it } from "vitest";
import {
	type BookingValues,
	buildBookingUpdate,
	validateBookingDraft,
} from "@/components/pages/edit-booking-validation";

const VALID: BookingValues = {
	date: "2026-11-01",
	startTime: "09:00",
	guests: "4",
	guestNames: "Jane, John",
	languageRequired: "en",
	notes: "",
	depositUsd: "10",
	totalUsd: "40",
	paymentMethod: "card",
	scheduleId: "",
};

describe("validateBookingDraft", () => {
	it("accepts a valid draft", () => {
		expect(validateBookingDraft(VALID)).toEqual({});
	});

	it("requires date and start time", () => {
		expect(validateBookingDraft({ ...VALID, date: "" })).toEqual({
			date: "Date is required",
		});
		expect(validateBookingDraft({ ...VALID, startTime: "" })).toEqual({
			startTime: "Start time is required",
		});
	});

	it("rejects non-positive guest counts", () => {
		const problems = validateBookingDraft({ ...VALID, guests: "0" });
		expect(problems.guests).toMatch(/guests/i);
		expect(
			validateBookingDraft({ ...VALID, guests: "abc" }).guests,
		).toBeDefined();
	});

	it("rejects over-long text fields", () => {
		expect(
			validateBookingDraft({ ...VALID, guestNames: "x".repeat(2001) })
				.guestNames,
		).toMatch(/too long/);
		expect(
			validateBookingDraft({ ...VALID, languageRequired: "x".repeat(51) })
				.languageRequired,
		).toMatch(/too long/);
		expect(
			validateBookingDraft({ ...VALID, paymentMethod: "x".repeat(51) })
				.paymentMethod,
		).toMatch(/too long/);
	});

	it("rejects non-numeric totals and deposits", () => {
		expect(validateBookingDraft({ ...VALID, totalUsd: "abc" }).totalUsd).toBe(
			"Total amount must be a non-negative number",
		);
		expect(
			validateBookingDraft({ ...VALID, depositUsd: "abc" }).depositUsd,
		).toBe("Deposit must be a non-negative number");
	});

	it("rejects a deposit above the total", () => {
		expect(
			validateBookingDraft({ ...VALID, depositUsd: "50", totalUsd: "40" })
				.depositUsd,
		).toBe("Deposit cannot exceed the total amount");
	});

	it("allows blank amounts", () => {
		expect(
			validateBookingDraft({ ...VALID, depositUsd: "", totalUsd: "" }),
		).toEqual({});
	});
});

describe("buildBookingUpdate", () => {
	it("parses numbers and trims optionals to undefined", () => {
		expect(buildBookingUpdate(VALID)).toEqual({
			date: "2026-11-01",
			startTime: "09:00",
			guests: 4,
			guestNames: "Jane, John",
			languageRequired: "en",
			notes: undefined,
			depositAmountCents: 1000n,
			totalAmountCents: 4000n,
			paymentMethod: "card",
			scheduleId: "",
		});
	});

	it("leaves blank amounts undefined", () => {
		const payload = buildBookingUpdate({
			...VALID,
			depositUsd: "  ",
			totalUsd: "",
			paymentMethod: "   ",
		});
		expect(payload.depositAmountCents).toBeUndefined();
		expect(payload.totalAmountCents).toBeUndefined();
		expect(payload.paymentMethod).toBeUndefined();
	});
});
