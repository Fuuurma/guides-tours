import { describe, expect, it } from "vitest";
import { isInviteExpired, planInvitationResend } from "../invitations";

const NOW = new Date("2026-09-13T12:00:00Z").getTime();
const FUTURE = "2026-09-20T00:00:00Z";
const PAST = "2026-09-01T00:00:00Z";

describe("isInviteExpired", () => {
	it("returns false for a future expiresAt", () => {
		expect(
			isInviteExpired({ id: "1", email: "a@b.c", expiresAt: FUTURE }, NOW),
		).toBe(false);
	});

	it("returns true for a past expiresAt", () => {
		expect(
			isInviteExpired({ id: "1", email: "a@b.c", expiresAt: PAST }, NOW),
		).toBe(true);
	});

	it("returns true when expiresAt is missing or invalid", () => {
		expect(isInviteExpired({ id: "1", email: "a@b.c" }, NOW)).toBe(true);
		expect(
			isInviteExpired({ id: "1", email: "a@b.c", expiresAt: null }, NOW),
		).toBe(true);
		expect(
			isInviteExpired({ id: "1", email: "a@b.c", expiresAt: "junk" }, NOW),
		).toBe(true);
	});

	it("treats a boundary timestamp as expired", () => {
		expect(
			isInviteExpired({ id: "1", email: "a@b.c", expiresAt: NOW }, NOW),
		).toBe(true);
	});
});

describe("planInvitationResend", () => {
	it("cancels nothing when the target invite is still live", () => {
		const live = { id: "live", email: "a@b.c", expiresAt: FUTURE };
		expect(planInvitationResend([live], live, NOW)).toEqual([]);
	});

	it("cancels the target itself when it is expired", () => {
		const stale = { id: "stale", email: "a@b.c", expiresAt: PAST };
		expect(planInvitationResend([stale], stale, NOW)).toEqual(["stale"]);
	});

	it("cancels every expired row for the same email, not just the target", () => {
		const live = { id: "live", email: "a@b.c", expiresAt: FUTURE };
		const stale1 = { id: "s1", email: "a@b.c", expiresAt: PAST };
		const stale2 = { id: "s2", email: "a@b.c", expiresAt: PAST };
		expect(
			planInvitationResend([live, stale1, stale2], live, NOW).sort(),
		).toEqual(["s1", "s2"]);
	});

	it("leaves expired rows for other emails alone", () => {
		const target = { id: "t", email: "a@b.c", expiresAt: FUTURE };
		const other = { id: "o", email: "x@y.z", expiresAt: PAST };
		expect(planInvitationResend([target, other], target, NOW)).toEqual([]);
	});

	it("matches emails case-insensitively", () => {
		const target = { id: "t", email: "A@b.c", expiresAt: FUTURE };
		const stale = { id: "s", email: "a@B.C", expiresAt: PAST };
		expect(planInvitationResend([target, stale], target, NOW)).toEqual(["s"]);
	});
});
