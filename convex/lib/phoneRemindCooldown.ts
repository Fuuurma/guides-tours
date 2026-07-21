/**
 * Cooldown helpers for phone-add reminders.
 *
 * Two layers:
 *   - Per-user: don't re-email the same person within USER_COOLDOWN_MS
 *     (protects guides when digest cron + manual send both fire).
 *   - Org bulk: don't queue another manual blast within ORG_BULK_COOLDOWN_MS
 *     (double-click / impatient admin protection).
 */

/** 7 days — staff shouldn't get nagged daily. */
export const USER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** 24 hours between manual "Remind all" blasts. */
export const ORG_BULK_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Milliseconds still remaining before `lastAt + cooldownMs`. */
export function cooldownRemainingMs(
	lastAt: number | undefined,
	cooldownMs: number,
	now: number = Date.now(),
): number {
	if (lastAt === undefined) return 0;
	return Math.max(0, lastAt + cooldownMs - now);
}

/** True when a new send is allowed. */
export function isCooldownClear(
	lastAt: number | undefined,
	cooldownMs: number,
	now: number = Date.now(),
): boolean {
	return cooldownRemainingMs(lastAt, cooldownMs, now) === 0;
}

/** Human-readable remaining time for error/UI copy. */
export function formatCooldownRemaining(ms: number): string {
	if (ms <= 0) return "now";
	const hours = Math.ceil(ms / (60 * 60 * 1000));
	if (hours < 48) {
		return hours === 1 ? "about 1 hour" : `about ${hours} hours`;
	}
	const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
	return days === 1 ? "about 1 day" : `about ${days} days`;
}

/**
 * Split missing-phone candidates into eligible vs still cooling down.
 * Pure — easy to unit test without Convex.
 */
export function partitionByUserCooldown<T extends { userId: string }>(
	candidates: T[],
	lastSentByUserId: Map<string, number>,
	cooldownMs: number = USER_COOLDOWN_MS,
	now: number = Date.now(),
): { eligible: T[]; coolingDown: T[] } {
	const eligible: T[] = [];
	const coolingDown: T[] = [];
	for (const c of candidates) {
		const last = lastSentByUserId.get(c.userId);
		if (isCooldownClear(last, cooldownMs, now)) eligible.push(c);
		else coolingDown.push(c);
	}
	return { eligible, coolingDown };
}
