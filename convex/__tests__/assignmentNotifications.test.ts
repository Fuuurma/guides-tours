import { describe, expect, it } from "vitest";
import {
	formatAssignmentNotify,
	formatDriverAssignmentNotify,
} from "../assignmentNotifications";

describe("formatAssignmentNotify", () => {
	const base = {
		guideName: "Alex",
		tourName: "City Walk",
		date: "2026-08-01",
		startTime: "09:00",
		endTime: "11:00",
		assignmentUrl: "https://app.example.com/dashboard/assignments/a1",
	};

	it("formats created", () => {
		const msg = formatAssignmentNotify({ ...base, event: "created" });
		expect(msg.subject).toContain("You're assigned");
		expect(msg.bodyText).toContain("Alex");
		expect(msg.bodyText).toContain("City Walk");
		expect(msg.bodyText).toContain(base.assignmentUrl);
		expect(msg.smsBody).toContain("Assigned:");
	});

	it("formats cancelled", () => {
		const msg = formatAssignmentNotify({ ...base, event: "cancelled" });
		expect(msg.subject).toContain("Assignment cancelled");
		expect(msg.bodyText).toContain("was cancelled");
		expect(msg.smsBody).toContain("Cancelled:");
	});

	it("formats reassigned_away", () => {
		const msg = formatAssignmentNotify({
			...base,
			event: "reassigned_away",
		});
		expect(msg.subject).toContain("Assignment changed");
		expect(msg.bodyText).toContain("no longer assigned");
		expect(msg.smsBody).toContain("No longer assigned");
	});
});

describe("formatDriverAssignmentNotify", () => {
	const base = {
		driverName: "Sam",
		tourName: "Coast Loop",
		date: "2026-08-02",
		startTime: "10:00",
		endTime: "14:00",
		assignmentUrl: "https://app.example.com/dashboard/assignments/a2",
	};

	it("formats created", () => {
		const msg = formatDriverAssignmentNotify({ ...base, event: "created" });
		expect(msg.subject).toContain("Driving assignment");
		expect(msg.bodyText).toContain("Sam");
		expect(msg.bodyText).toContain("driver for");
		expect(msg.smsBody).toContain("Driving:");
	});

	it("formats cancelled and reassigned", () => {
		expect(
			formatDriverAssignmentNotify({ ...base, event: "cancelled" }).smsBody,
		).toContain("Driving cancelled");
		expect(
			formatDriverAssignmentNotify({ ...base, event: "reassigned_away" })
				.smsBody,
		).toContain("No longer driving");
	});
});
