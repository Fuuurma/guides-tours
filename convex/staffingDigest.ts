/**
 * Daily ops digest for understaffed departures.
 *
 * Orgs opt in via notificationSettings.staffingDigestEnabled and set
 * email and/or phone. Cron runs once daily (UTC morning); admins can
 * also trigger sendNow from notification settings.
 */

import { v, ConvexError } from "convex/values";
import {
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";
import { sendTemplatedEmail } from "./lib/sendEmail";
import { sendTwilioSms } from "./notification_sms";
import {
	addDaysYmd,
	computeStaffingGaps,
	formatStaffingDigest,
	utcYmd,
	type StaffingGapRow,
} from "./lib/staffingGaps";
import { getSiteUrl } from "./lib/siteUrl";

const MAX_ROWS = 500;
const MAX_ORGS_PER_RUN = 100;

export const listDigestTargets = internalQuery({
	args: {},
	handler: async (ctx) => {
		const rows = await ctx.db.query("notificationSettings").take(MAX_ORGS_PER_RUN);
		return rows
			.filter((r) => r.staffingDigestEnabled === true)
			.filter((r) => Boolean(r.staffingDigestEmail) || Boolean(r.staffingDigestPhone))
			.map((r) => ({
				organizationId: r.organizationId,
				email: r.staffingDigestEmail,
				phone: r.staffingDigestPhone,
				daysAhead: Math.min(14, Math.max(1, r.staffingDigestDaysAhead ?? 3)),
				emailEnabled: r.emailEnabled,
				emailFromEmail: r.emailFromEmail,
				emailFromName: r.emailFromName,
				phoneRemindWithDigest: r.phoneRemindWithDigest === true,
			}));
	},
});

export const gapsForOrg = internalQuery({
	args: {
		organizationId: v.string(),
		dateFrom: v.string(),
		dateTo: v.string(),
	},
	handler: async (ctx, args) => {
		const schedules = await ctx.db
			.query("tourSchedules")
			.withIndex("by_org_date", (q) =>
				q
					.eq("organizationId", args.organizationId)
					.gte("date", args.dateFrom)
					.lte("date", args.dateTo),
			)
			.take(MAX_ROWS);

		const assignments = await ctx.db
			.query("assignments")
			.withIndex("by_org_date", (q) =>
				q
					.eq("organizationId", args.organizationId)
					.gte("date", args.dateFrom)
					.lte("date", args.dateTo),
			)
			.take(MAX_ROWS);

		const tourIds = new Set<string>();
		for (const s of schedules) tourIds.add(String(s.tourId));
		for (const a of assignments) {
			if (!a.deletedAt && a.status !== "cancelled") {
				tourIds.add(String(a.tourId));
			}
		}
		const toursById = new Map<
			string,
			{
				_id: Id<"tours">;
				name: string;
				tourType: string;
				requiredGuides: number;
				requiresVehicle?: boolean;
				requiresDriver?: boolean;
				requiredVehicleType?: string;
			}
		>();
		for (const id of tourIds) {
			const t = await ctx.db.get(id as Id<"tours">);
			if (t) {
				toursById.set(String(t._id), {
					_id: t._id,
					name: t.name,
					tourType: t.tourType,
					requiredGuides: t.requiredGuides,
					requiresVehicle: t.requiresVehicle,
					requiresDriver: t.requiresDriver,
					requiredVehicleType: t.requiredVehicleType,
				});
			}
		}

		return computeStaffingGaps({ schedules, assignments, toursById });
	},
});

export const recordDigestLog = internalMutation({
	args: {
		organizationId: v.string(),
		channel: v.string(),
		recipient: v.string(),
		status: v.string(),
		gapCount: v.number(),
		errorMessage: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.db.insert("notificationLogs", {
			organizationId: args.organizationId,
			templateName: "staffing_digest",
			channel: args.channel,
			recipient: args.recipient,
			status: args.status,
			errorMessage: args.errorMessage,
			metadata: { gapCount: args.gapCount },
			createdAt: now,
		});
	},
});

export const sendForOrg = internalAction({
	args: {
		organizationId: v.string(),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		daysAhead: v.number(),
		emailEnabled: v.boolean(),
		emailFromEmail: v.optional(v.string()),
		emailFromName: v.optional(v.string()),
		force: v.optional(v.boolean()),
		phoneRemindWithDigest: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const dateFrom = utcYmd();
		const dateTo = addDaysYmd(dateFrom, Math.max(0, args.daysAhead - 1));
		const gaps = (await ctx.runQuery(internal.staffingDigest.gapsForOrg, {
			organizationId: args.organizationId,
			dateFrom,
			dateTo,
		})) as StaffingGapRow[];

		const missingPhones = (await ctx.runQuery(
			internal.userProfiles.missingStaffPhonesInternal,
			{
				organizationId: args.organizationId,
				dateFrom,
				dateTo,
			},
		)) as Array<{
			name: string;
			roles: string[];
			assignmentCount: number;
		}>;

		if (gaps.length === 0 && missingPhones.length === 0 && !args.force) {
			return {
				skipped: true,
				gapCount: 0,
				email: null,
				sms: null,
				phoneRemindQueued: false,
			};
		}

		const { subject, bodyText, smsBody } = formatStaffingDigest({
			dateFrom,
			dateTo,
			gaps,
			siteUrl: getSiteUrl(),
			missingPhones,
		});

		let emailResult: string | null = null;
		let smsResult: string | null = null;

		if (args.email) {
			const sent = await sendTemplatedEmail({
				to: args.email,
				subject,
				bodyText,
				from: args.emailFromEmail,
			});
			emailResult = sent.status;
			await ctx.runMutation(internal.staffingDigest.recordDigestLog, {
				organizationId: args.organizationId,
				channel: "email",
				recipient: args.email,
				status: sent.status === "sent" ? "sent" : sent.status,
				gapCount: gaps.length,
				errorMessage:
					sent.status === "failed"
						? sent.error
						: sent.status === "skipped"
							? sent.reason
							: undefined,
			});
		}

		if (args.phone) {
			const sms = await sendTwilioSms(ctx, {
				organizationId: args.organizationId,
				to: args.phone,
				body: smsBody,
				recipientName: "Ops",
			});
			smsResult = sms.ok ? "sent" : (sms.error ?? "failed");
			await ctx.runMutation(internal.staffingDigest.recordDigestLog, {
				organizationId: args.organizationId,
				channel: "sms",
				recipient: args.phone,
				status: sms.ok ? "sent" : "failed",
				gapCount: gaps.length,
				errorMessage: sms.ok ? undefined : sms.error,
			});
		}

		// Opt-in: also nudge staff missing phones (per-user 7d cooldown
		// inside runForOrg). Never tied to org bulk cooldown — digest is
		// daily ops automation, not a manual blast.
		let phoneRemindQueued = false;
		if (args.phoneRemindWithDigest === true && missingPhones.length > 0) {
			await ctx.scheduler.runAfter(0, internal.phoneReminders.runForOrg, {
				organizationId: args.organizationId,
				dateFrom,
				dateTo,
				emailFromEmail: args.emailFromEmail,
				source: "digest" as const,
			});
			phoneRemindQueued = true;
		}

		return {
			skipped: false,
			gapCount: gaps.length,
			email: emailResult,
			sms: smsResult,
			phoneRemindQueued,
		};
	},
});

/** Cron entry: fan out digests to opted-in orgs. */
export const runDaily = internalMutation({
	args: {},
	handler: async (ctx) => {
		const targets = await ctx.runQuery(internal.staffingDigest.listDigestTargets, {});
		let scheduled = 0;
		for (const t of targets) {
			await ctx.scheduler.runAfter(0, internal.staffingDigest.sendForOrg, {
				organizationId: t.organizationId,
				email: t.email,
				phone: t.phone,
				daysAhead: t.daysAhead,
				emailEnabled: t.emailEnabled,
				emailFromEmail: t.emailFromEmail,
				emailFromName: t.emailFromName,
				phoneRemindWithDigest: t.phoneRemindWithDigest,
			});
			scheduled += 1;
		}
		return { scheduled };
	},
});

/** Admin: send digest now (even if zero gaps when force). */
export const sendNow = mutation({
	args: {
		force: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		const settings = await ctx.db
			.query("notificationSettings")
			.withIndex("by_org", (q) => q.eq("organizationId", member.organizationId))
			.first();
		if (!settings) {
			throw new ConvexError(
				"Save notification settings first, then enable the staffing digest",
			);
		}
		if (!settings.staffingDigestEmail && !settings.staffingDigestPhone) {
			throw new ConvexError("Set a digest email and/or phone first");
		}
		await ctx.scheduler.runAfter(0, internal.staffingDigest.sendForOrg, {
			organizationId: member.organizationId,
			email: settings.staffingDigestEmail,
			phone: settings.staffingDigestPhone,
			daysAhead: Math.min(14, Math.max(1, settings.staffingDigestDaysAhead ?? 3)),
			emailEnabled: settings.emailEnabled,
			emailFromEmail: settings.emailFromEmail,
			emailFromName: settings.emailFromName,
			force: args.force ?? true,
			phoneRemindWithDigest: settings.phoneRemindWithDigest === true,
		});
		await logAudit(ctx, {
			organizationId: member.organizationId,
			userId: member.userId,
			action: "staffing_digest.sent_now",
			resourceType: "notificationSettings",
			resourceId: settings._id,
			oldValues: {},
			newValues: { force: args.force ?? true },
		});
		return { scheduled: true };
	},
});
