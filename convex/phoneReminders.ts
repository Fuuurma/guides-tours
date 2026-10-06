/**
 * Remind assigned staff who have no phone to add one
 * (so assignment SMS can reach them).
 *
 * Cooldowns (see lib/phoneRemindCooldown.ts):
 *   - Per-user 7d after a successful send
 *   - Org 24h between manual bulk queues
 *
 * Digest cron may also queue this when
 * notificationSettings.phoneRemindWithDigest is true (opt-in).
 */

import { v, ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";
import { sendTemplatedEmail } from "./lib/sendEmail";
import { addDaysYmd, utcYmd } from "./lib/staffingGaps";
import { dashboardUrl } from "./lib/siteUrl";
import { logger } from "./lib/logger";
import type { MissingStaffPhone } from "./lib/userContact";
import { collectMissingStaffPhones } from "./userProfiles";
import {
	ORG_BULK_COOLDOWN_MS,
	USER_COOLDOWN_MS,
	cooldownRemainingMs,
	formatCooldownRemaining,
	partitionByUserCooldown,
} from "./lib/phoneRemindCooldown";

const MAX_RECIPIENTS = 50;

export function formatPhoneReminder(input: {
	name: string;
	profileUrl: string;
	roles: string[];
	assignmentCount: number;
	dateFrom: string;
	dateTo: string;
}): { subject: string; bodyText: string } {
	const roleLabel = input.roles.join(" / ");
	const subject = `Add your phone · assignment alerts`;
	const bodyText = [
		`Hi ${input.name},`,
		"",
		`You're on ${input.assignmentCount} upcoming assignment${input.assignmentCount === 1 ? "" : "s"} as ${roleLabel} (${input.dateFrom} → ${input.dateTo}), but we don't have a phone number for you.`,
		"",
		"Please add your phone so we can text you when you're assigned, reassigned, or cancelled:",
		input.profileUrl,
		"",
		"Email still works either way — SMS is optional but helpful on the day.",
	].join("\n");
	return { subject, bodyText };
}

export const recordLog = internalMutation({
	args: {
		organizationId: v.string(),
		recipient: v.string(),
		status: v.string(),
		userId: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ctx.db.insert("notificationLogs", {
			organizationId: args.organizationId,
			templateName: "phone_reminder",
			channel: "email",
			recipient: args.recipient,
			status: args.status,
			errorMessage: args.errorMessage,
			metadata: { userId: args.userId ?? "" },
			createdAt: Date.now(),
		});
	},
});

/** Persist successful send so the user enters the 7d cooldown. */
export const markUserSent = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		sentAt: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const now = args.sentAt ?? Date.now();
		const existing = await ctx.db
			.query("phoneReminderSends")
			.withIndex("by_org_user", (q) =>
				q.eq("organizationId", args.organizationId).eq("userId", args.userId),
			)
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, { lastSentAt: now });
			return existing._id;
		}
		return await ctx.db.insert("phoneReminderSends", {
			organizationId: args.organizationId,
			userId: args.userId,
			lastSentAt: now,
		});
	},
});

// GT-AUDIT-01: resolve lastSentAt per candidate through the by_org_user
// index instead of reading one page of by_org. `by_org` returns rows in
// creation order, so a .take(500) page keeps the 500 OLDEST sends — the
// most recently reminded staff are exactly the ones dropped, and absence
// was read as "never reminded". Duplicate reminders therefore went out
// inside the 7-day window, and cooldownStatus reported the bypassed state
// as correct. markUserSent keeps exactly one row per (org, user), so a
// point read on that index is the whole answer.
//
// Sequential on purpose: candidate lists are staff-sized, and a single
// indexed point read each is both cheaper and more predictable than the
// fan-out a parallel map would produce.
//
// Exported so the truncation scenario can be tested directly: the decision
// that consumes this map is three mutations deep behind auth and schedule
// seeding, which is not where this contract is worth pinning.
export async function lastSentAtByUserId(
	ctx: QueryCtx | MutationCtx,
	organizationId: string,
	userIds: Iterable<string>,
): Promise<Map<string, number>> {
	const out = new Map<string, number>();
	for (const userId of new Set(userIds)) {
		const row = await ctx.db
			.query("phoneReminderSends")
			.withIndex("by_org_user", (q) =>
				q.eq("organizationId", organizationId).eq("userId", userId),
			)
			.unique();
		if (row) out.set(userId, row.lastSentAt);
	}
	return out;
}

/**
 * Action-facing seam for `lastSentAtByUserId`. Actions cannot touch the
 * database directly, and this is the same lookup the query/mutation paths
 * call — one implementation, so the cooldown rule cannot drift between
 * them.
 */
// The explicit return type is load-bearing, not decoration: without it the
// inference chain runForOrg -> internal.phoneReminders.lastSentForUsers ->
// typeof phoneReminders -> runForOrg is circular, TS7022s runForOrg to `any`,
// and that `any` poisons the whole module type — api.d.ts imports
// `typeof phoneReminders`, so every Convex query in the app loses its return
// type and the repo fails with ~588 unrelated errors.
export const lastSentForUsers = internalQuery({
	args: { organizationId: v.string(), userIds: v.array(v.string()) },
	handler: async (ctx, args): Promise<Array<[string, number]>> => [
		...(await lastSentAtByUserId(ctx, args.organizationId, args.userIds)),
	],
});

/**
 * Status for Home / Staffing buttons: how many are eligible, org bulk wait.
 */
export const cooldownStatus = query({
	args: {
		dateFrom: v.string(),
		dateTo: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		const now = Date.now();

		const settings = await ctx.db
			.query("notificationSettings")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId))
			.first();

		const missing = await collectMissingStaffPhones(
			ctx,
			orgId,
			args.dateFrom,
			args.dateTo,
		);
		const withEmail = missing.filter((p) => p.email.trim());

		const lastSentByUserId = await lastSentAtByUserId(
			ctx,
			orgId,
			withEmail.map((p) => p.userId),
		);
		const { eligible, coolingDown } = partitionByUserCooldown(
			withEmail,
			lastSentByUserId,
			USER_COOLDOWN_MS,
			now,
		);

		const orgBulkRemainingMs = cooldownRemainingMs(
			settings?.phoneRemindLastBulkAt,
			ORG_BULK_COOLDOWN_MS,
			now,
		);

		return {
			missingCount: missing.length,
			eligibleCount: eligible.length,
			coolingDownCount: coolingDown.length,
			orgBulkRemainingMs,
			orgBulkClear: orgBulkRemainingMs === 0,
			canSendManual: orgBulkRemainingMs === 0 && eligible.length > 0,
			phoneRemindWithDigest: settings?.phoneRemindWithDigest === true,
			userCooldownDays: USER_COOLDOWN_MS / (24 * 60 * 60 * 1000),
			orgBulkCooldownHours: ORG_BULK_COOLDOWN_MS / (60 * 60 * 1000),
		};
	},
});

export const sendForPerson = internalAction({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		name: v.string(),
		email: v.string(),
		roles: v.array(v.string()),
		assignmentCount: v.number(),
		dateFrom: v.string(),
		dateTo: v.string(),
		emailFromEmail: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (!args.email.trim()) {
			await ctx.runMutation(internal.phoneReminders.recordLog, {
				organizationId: args.organizationId,
				recipient: args.userId,
				status: "skipped",
				userId: args.userId,
				errorMessage: "No email",
			});
			return { skipped: true as const, reason: "no_email" as const };
		}

		const profileUrl = dashboardUrl(`/dashboard/guides/${args.userId}`);
		const { subject, bodyText } = formatPhoneReminder({
			name: args.name,
			profileUrl,
			roles: args.roles,
			assignmentCount: args.assignmentCount,
			dateFrom: args.dateFrom,
			dateTo: args.dateTo,
		});

		const sent = await sendTemplatedEmail({
			to: args.email,
			subject,
			bodyText,
			from: args.emailFromEmail,
		});
		await ctx.runMutation(internal.phoneReminders.recordLog, {
			organizationId: args.organizationId,
			recipient: args.email,
			status: sent.status === "sent" ? "sent" : sent.status,
			userId: args.userId,
			errorMessage:
				sent.status === "failed"
					? sent.error
					: sent.status === "skipped"
						? sent.reason
						: undefined,
		});

		// Only start the 7d clock after a real delivery — failed/skipped
		// must remain retryable (manual or next digest).
		if (sent.status === "sent") {
			await ctx.runMutation(internal.phoneReminders.markUserSent, {
				organizationId: args.organizationId,
				userId: args.userId,
			});
			return { skipped: false as const, email: "sent" as const };
		}

		return {
			skipped: true as const,
			reason: (sent.status === "failed" ? "send_failed" : "send_skipped") as
				| "send_failed"
				| "send_skipped",
			email: sent.status,
		};
	},
});

export const runForOrg = internalAction({
	args: {
		organizationId: v.string(),
		dateFrom: v.string(),
		dateTo: v.string(),
		emailFromEmail: v.optional(v.string()),
		source: v.optional(v.union(v.literal("manual"), v.literal("digest"))),
	},
	// The explicit return type breaks an inference cycle and is load-bearing.
	// This action's result is consumed through `internal.runForOrg`, whose
	// type is derived from `typeof phoneReminders` — the module that contains
	// it. Unannotated, TypeScript reports TS7022, types the action as `any`,
	// and because api.d.ts imports the module type directly, every Convex
	// query in the app loses its return type and the repo fails with hundreds
	// of unrelated errors. `lastSentForUsers` carries the same annotation for
	// the same reason on the other end of the cycle.
	handler: async (
		ctx,
		args,
	): Promise<{
		source: string;
		candidates: number;
		withEmail: number;
		coolingDown: number;
		queued: number;
		sent: number;
		skipped: number;
	}> => {
		const missing = (await ctx.runQuery(
			internal.userProfiles.missingStaffPhonesInternal,
			{
				organizationId: args.organizationId,
				dateFrom: args.dateFrom,
				dateTo: args.dateTo,
			},
		)) as MissingStaffPhone[];

		const withEmail = missing.filter((p) => p.email.trim());
		// runForOrg is an ACTION — its ctx carries no `db` — so the point
		// reads happen behind an internal query rather than inline.
		const lastSentByUserId = new Map(
			(await ctx.runQuery(internal.phoneReminders.lastSentForUsers, {
				organizationId: args.organizationId,
				userIds: withEmail.map((p) => p.userId),
			})) as Array<[string, number]>,
		);
		const { eligible, coolingDown } = partitionByUserCooldown(
			withEmail,
			lastSentByUserId,
		);
		const targets = eligible.slice(0, MAX_RECIPIENTS);

		let sent = 0;
		let skipped = 0;
		for (const p of targets) {
			const result = await ctx.runAction(
				internal.phoneReminders.sendForPerson,
				{
					organizationId: args.organizationId,
					userId: p.userId,
					name: p.name,
					email: p.email,
					roles: p.roles,
					assignmentCount: p.assignmentCount,
					dateFrom: args.dateFrom,
					dateTo: args.dateTo,
					emailFromEmail: args.emailFromEmail,
				},
			);
			if (result.skipped) skipped += 1;
			else sent += 1;
		}

		return {
			source: args.source ?? "manual",
			candidates: missing.length,
			withEmail: withEmail.length,
			coolingDown: coolingDown.length,
			queued: targets.length,
			sent,
			skipped,
		};
	},
});

/**
 * Admin: email assigned staff who have no phone.
 * Respects org 24h bulk cooldown + per-user 7d cooldown.
 */
export const sendReminders = mutation({
	args: {
		dateFrom: v.optional(v.string()),
		dateTo: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		const dateFrom = args.dateFrom?.trim() || utcYmd();
		const dateTo = args.dateTo?.trim() || addDaysYmd(dateFrom, 13);
		const now = Date.now();

		const settings = await ctx.db
			.query("notificationSettings")
			.withIndex("by_org", (q) => q.eq("organizationId", member.organizationId))
			.first();
		if (!settings) {
			throw new ConvexError(
				"Save notification settings first (From email), then send reminders",
			);
		}

		const orgRemaining = cooldownRemainingMs(
			settings.phoneRemindLastBulkAt,
			ORG_BULK_COOLDOWN_MS,
			now,
		);
		if (orgRemaining > 0) {
			throw new ConvexError(
				`Phone reminders were sent recently — try again in ${formatCooldownRemaining(orgRemaining)}`,
			);
		}

		const missing = await collectMissingStaffPhones(
			ctx,
			member.organizationId,
			dateFrom,
			dateTo,
		);
		const withEmail = missing.filter((p) => p.email.trim());
		if (withEmail.length === 0) {
			throw new ConvexError(
				missing.length === 0
					? "Everyone on upcoming assignments already has a phone (or there are no assignments)"
					: "Staff missing phones have no email on file — can't send reminders",
			);
		}

		const lastSentByUserId = await lastSentAtByUserId(
			ctx,
			member.organizationId,
			withEmail.map((p) => p.userId),
		);
		const { eligible, coolingDown } = partitionByUserCooldown(
			withEmail,
			lastSentByUserId,
			USER_COOLDOWN_MS,
			now,
		);
		if (eligible.length === 0) {
			throw new ConvexError(
				`All ${coolingDown.length} staff missing a phone were reminded in the last 7 days`,
			);
		}

		// Stamp bulk cooldown before scheduling so a double-click can't
		// enqueue two blasts. Per-user stamps happen only after success.
		await ctx.db.patch(settings._id, {
			phoneRemindLastBulkAt: now,
			updatedAt: now,
		});

		await ctx.scheduler.runAfter(0, internal.phoneReminders.runForOrg, {
			organizationId: member.organizationId,
			dateFrom,
			dateTo,
			emailFromEmail: settings.emailFromEmail,
			source: "manual" as const,
		});

		await logAudit(ctx, {
			organizationId: member.organizationId,
			userId: member.userId,
			action: "phone_reminder.sent",
			resourceType: "notificationSettings",
			resourceId: settings._id,
			oldValues: {
				phoneRemindLastBulkAt: settings.phoneRemindLastBulkAt,
			},
			newValues: {
				dateFrom,
				dateTo,
				candidates: missing.length,
				eligible: eligible.length,
				coolingDown: coolingDown.length,
			},
		});

		return {
			queued: true as const,
			candidates: missing.length,
			eligible: eligible.length,
			coolingDown: coolingDown.length,
			capped: eligible.length > MAX_RECIPIENTS,
		};
	},
});

/** Drop phone-remind cooldown rows older than retention (default 30d). */
export const PHONE_REMIND_SEND_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const purgeOldSends = internalMutation({
	args: {
		// Paginated org discovery: the old bare .take(100) silently
		// skipped orgs past the first page (org 101+ never purged).
		cursor: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const cutoff = Date.now() - PHONE_REMIND_SEND_RETENTION_MS;
		const MAX_PER_ORG = 500;
		// Iterate orgs via notificationSettings (the set of orgs that
		// could have phoneReminderSends rows), one paginated page per
		// run with self-continuation (mirror of tourAnalytics.runDaily).
		// Previously a bare .take(100) capped discovery, so orgs past
		// the first 100 never had their old sends purged.
		const orgSettings = await ctx.db
			.query("notificationSettings")
			.paginate({ numItems: 100, cursor: args.cursor ?? null });
		let totalDeleted = 0;
		for (const settings of orgSettings.page) {
			const old = await ctx.db
				.query("phoneReminderSends")
				.withIndex("by_org_lastSentAt", (q) =>
					q
						.eq("organizationId", settings.organizationId)
						.lt("lastSentAt", cutoff),
				)
				.take(MAX_PER_ORG);
			await Promise.all(old.map((row) => ctx.db.delete(row._id)));
			totalDeleted += old.length;
		}
		if (!orgSettings.isDone) {
			// Continue discovery on the next page — the cron chain walks
			// the whole table across runs (self-continuation, mirroring
			// tourAnalytics.runDaily).
			await ctx.scheduler.runAfter(0, internal.phoneReminders.purgeOldSends, {
				cursor: orgSettings.continueCursor,
			});
		}
		if (totalDeleted > 0) {
			logger.info(
				`[cron] purgeOldPhoneReminderSends deleted ${totalDeleted} (cutoff=${new Date(cutoff).toISOString()})`,
			);
		}
		return { deleted: totalDeleted, cutoff };
	},
});
