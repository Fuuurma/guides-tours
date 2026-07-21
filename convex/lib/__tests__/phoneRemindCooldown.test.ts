import { describe, expect, it } from "vitest";
import {
	ORG_BULK_COOLDOWN_MS,
	USER_COOLDOWN_MS,
	cooldownRemainingMs,
	formatCooldownRemaining,
	isCooldownClear,
	partitionByUserCooldown,
} from "../phoneRemindCooldown";

describe("phoneRemindCooldown", () => {
	const now = Date.UTC(2026, 6, 20, 12, 0, 0);

	it("cooldownRemainingMs is 0 when never sent", () => {
		expect(cooldownRemainingMs(undefined, USER_COOLDOWN_MS, now)).toBe(0);
		expect(isCooldownClear(undefined, USER_COOLDOWN_MS, now)).toBe(true);
	});

	it("cooldownRemainingMs respects window", () => {
		const last = now - USER_COOLDOWN_MS / 2;
		const remaining = cooldownRemainingMs(last, USER_COOLDOWN_MS, now);
		expect(remaining).toBe(USER_COOLDOWN_MS / 2);
		expect(isCooldownClear(last, USER_COOLDOWN_MS, now)).toBe(false);
	});

	it("clears after full cooldown", () => {
		const last = now - USER_COOLDOWN_MS;
		expect(isCooldownClear(last, USER_COOLDOWN_MS, now)).toBe(true);
	});

	it("formatCooldownRemaining is human", () => {
		expect(formatCooldownRemaining(0)).toBe("now");
		expect(formatCooldownRemaining(30 * 60 * 1000)).toMatch(/1 hour/);
		expect(formatCooldownRemaining(ORG_BULK_COOLDOWN_MS)).toMatch(/24 hours/);
		expect(formatCooldownRemaining(USER_COOLDOWN_MS)).toMatch(/7 days/);
	});

	it("partitionByUserCooldown splits eligible vs cooling", () => {
		const candidates = [
			{ userId: "a", n: 1 },
			{ userId: "b", n: 2 },
			{ userId: "c", n: 3 },
		];
		const last = new Map<string, number>([
			["a", now - 1000],
			["c", now - USER_COOLDOWN_MS - 1000],
		]);
		const { eligible, coolingDown } = partitionByUserCooldown(
			candidates,
			last,
			USER_COOLDOWN_MS,
			now,
		);
		expect(eligible.map((x) => x.userId).sort()).toEqual(["b", "c"]);
		expect(coolingDown.map((x) => x.userId)).toEqual(["a"]);
	});
});
