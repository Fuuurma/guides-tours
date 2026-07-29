/**
 * Guide availability reminders.
 *
 * When enabled on notification settings, each guide with unmarked days
 * in the upcoming window gets an email (and SMS if they have a phone
 * on their Better Auth user profile) with a deep link to their
 * availability calendar.
 */

import { v, ConvexError } from "convex/values";
import {
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import { requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";
import { sendTemplatedEmail } from "./lib/sendEmail";
import { sendTwilioSms } from "./notification_sms";
import { addDaysYmd, utcYmd } from "./lib/staffingGaps";
import { dashboardUrl, getSiteUrl } from "./lib/siteUrl";

const MAX_ORGS = 100;
const MAX_GUIDES = 200;
const MAX_AVAIL_ROWS = 2000;

export type GuideContact = {
	userId: string;
	name: string;
	email: string;
	phone: string;
};

export function datesInRange(dateFrom: string, dateTo: string): string[] {
	const out: string[] = [];
	let cur = dateFrom;
	// Cap to 31 days to avoid runaway loops on bad input.
	for (let i = 0; i < 31; i++) {
		if (cur > dateTo) break;
		out.push(cur);
		if (cur === dateTo) break;
		cur = addDaysYmd(cur, 1);
	}
	return out;
}

export function unmarkedDates(
	window: string[],
	marked: Set<string>,
): string[] {
	return window.filter((d) => !marked.has(d));
}

export function formatAvailabilityReminder(input: {
	guideName: string;
	dateFrom: string;
	dateTo: string;
	unmarked: string[];
	calendarUrl: string;
}): { subject: string; bodyText: string; smsBody: string } {
	const n = input.unmarked.length;
	const subject = `Confirm your availability · ${input.dateFrom}–${input.dateTo}`;
	const preview = input.unmarked.slice(0, 8).join(", ");
	const more =
		n > 8 ? ` (and ${n - 8} more)` : "";
	const bodyText = [
		`Hi ${input.guideName},`,
		"",
		`Please confirm your availability for the next stretch (${input.dateFrom} → ${input.dateTo}).`,
		`${n} day${n === 1 ? "" : "s"} still unmarked: ${preview}${more}.`,
		"",
		`Update your calendar: ${input.calendarUrl}`,
		"",
		"Mark days available or unavailable so ops can staff tours.",
	].join("\n");
	const smsBody = `Hi ${input.guideName}: ${n} unmarked day${n === 1 ? "" : "s"} ${input.dateFrom}–${input.dateTo}. ${input.calendarUrl}`;
	return { subject, bodyText, smsBody };
}

export const listReminderTargets = internalQuery({
	args: {},
	handler: async (ctx) => {
		const rows = await ctx.db.query("notificationSettings").take(MAX_ORGS);
		return rows
			.filter((r) => r.availabilityReminderEnabled === true)
			.map((r) => ({
				organizationId: r.organizationId,
				daysAhead: Math.min(
					14,
					Math.max(1, r.availabilityReminderDaysAhead ?? 7),
				),
				emailFromEmail: r.emailFromEmail,
			}));
	},
});

export const unmarkedForGuide = internalQuery({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		dateFrom: v.string(),
		dateTo: v.string(),
	},
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query("availabilities")
			.withIndex("by_org_user_date", (q) =>
				q
					.eq("organizationId", args.organizationId)
					.eq("userId", args.userId)
					.gte("date", args.dateFrom)
					.lte("date", args.dateTo),
			)
			.take(MAX_AVAIL_ROWS);
		const marked = new Set(rows.map((r) => r.date));
		const window = datesInRange(args.dateFrom, args.dateTo);
		return unmarkedDates(window, marked);
	},
});

export const recordReminderLog = internalMutation({
	args: {
		organizationId: v.string(),
		channel: v.string(),
		recipient: v.string(),
		status: v.string(),
		unmarkedCount: v.number(),
		userId: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.db.insert("notificationLogs", {
			organizationId: args.organizationId,
			templateName: "availability_reminder",
			channel: args.channel,
			recipient: args.recipient,
			status: args.status,
			errorMessage: args.errorMessage,
			metadata: {
				unmarkedCount: args.unmarkedCount,
				userId: args.userId ?? "",
			},
			createdAt: now,
		});
	},
});

async function loadGuidesForOrg(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ctx: { runQuery: (ref: any, args: any) => Promise<any> },
	organizationId: string,
): Promise<GuideContact[]> {
	const page = (await ctx.runQuery(
		components.betterAuth.adapter.findMany as never,
		{
			model: "member" as never,
			where: [{ field: "organizationId", value: organizationId }] as never,
			paginationOpts: { cursor: null, numItems: MAX_GUIDES },
		},
	)) as {
		page?: Array<{ userId?: string; role?: string }>;
	};

	const members = (page.page ?? []).filter((m) => m.role === "guide");
	// Parallelize user lookups instead of sequential awaits
	// (was N round trips to Better Auth, now 1 batch).
	const userIds = members.map((m) => m.userId).filter((u): u is string => !!u);
	const users = await Promise.all(
		userIds.map((userId) =>
			ctx.runQuery(
				components.betterAuth.adapter.findOne as never,
				{
					model: "user" as never,
					where: [{ field: "id", value: userId }] as never,
				},
			),
		),
	);
	const out: GuideContact[] = [];
	for (let i = 0; i < userIds.length; i++) {
		const user = users[i] as {
			id?: string;
			name?: string | null;
			email?: string | null;
			phone?: string | null;
		} | null;
		if (!user?.email) continue;
		out.push({
			userId: userIds[i]!,
			name: user.name?.trim() || user.email,
			email: user.email,
			phone: (user.phone ?? "").trim(),
		});
	}
	return out;
}

export const sendForGuide = internalAction({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		name: v.string(),
		email: v.string(),
		phone: v.optional(v.string()),
		daysAhead: v.number(),
		emailFromEmail: v.optional(v.string()),
		force: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const dateFrom = utcYmd();
		const dateTo = addDaysYmd(dateFrom, Math.max(0, args.daysAhead - 1));
		const unmarked = (await ctx.runQuery(
			internal.availabilityReminders.unmarkedForGuide,
			{
				organizationId: args.organizationId,
				userId: args.userId,
				dateFrom,
				dateTo,
			},
		)) as string[];

		if (unmarked.length === 0 && !args.force) {
			return { skipped: true, unmarkedCount: 0 };
		}

		const calendarUrl = dashboardUrl(`/dashboard/guides/${args.userId}`);
		const { subject, bodyText, smsBody } = formatAvailabilityReminder({
			guideName: args.name,
			dateFrom,
			dateTo,
			unmarked:
				unmarked.length > 0 ? unmarked : datesInRange(dateFrom, dateTo),
			calendarUrl,
		});

		const sent = await sendTemplatedEmail({
			to: args.email,
			subject,
			bodyText,
			from: args.emailFromEmail,
		});
		await ctx.runMutation(internal.availabilityReminders.recordReminderLog, {
			organizationId: args.organizationId,
			channel: "email",
			recipient: args.email,
			status: sent.status === "sent" ? "sent" : sent.status,
			unmarkedCount: unmarked.length,
			userId: args.userId,
			errorMessage:
				sent.status === "failed"
					? sent.error
					: sent.status === "skipped"
						? sent.reason
						: undefined,
		});

		let smsStatus: string | null = null;
		if (args.phone) {
			const sms = await sendTwilioSms(ctx, {
				organizationId: args.organizationId,
				to: args.phone,
				body: smsBody,
				recipientName: args.name,
			});
			smsStatus = sms.ok ? "sent" : (sms.error ?? "failed");
			await ctx.runMutation(internal.availabilityReminders.recordReminderLog, {
				organizationId: args.organizationId,
				channel: "sms",
				recipient: args.phone,
				status: sms.ok ? "sent" : "failed",
				unmarkedCount: unmarked.length,
				userId: args.userId,
				errorMessage: sms.ok ? undefined : sms.error,
			});
		}

		return {
			skipped: false,
			unmarkedCount: unmarked.length,
			email: sent.status,
			sms: smsStatus,
			siteUrl: getSiteUrl(),
		};
	},
});

export const runForOrg = internalAction({
	args: {
		organizationId: v.string(),
		daysAhead: v.number(),
		emailFromEmail: v.optional(v.string()),
		force: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const guides = await loadGuidesForOrg(ctx, args.organizationId);

		let sent = 0;
		let skipped = 0;
		for (const g of guides) {
			const result = await ctx.runAction(
				internal.availabilityReminders.sendForGuide,
				{
					organizationId: args.organizationId,
					userId: g.userId,
					name: g.name,
					email: g.email,
					phone: g.phone || undefined,
					daysAhead: args.daysAhead,
					emailFromEmail: args.emailFromEmail,
					force: args.force,
				},
			);
			if (result.skipped) skipped += 1;
			else sent += 1;
		}
		return { guides: guides.length, sent, skipped };
	},
});

export const runDaily = internalMutation({
	args: {},
	handler: async (ctx) => {
		const targets = (await ctx.runQuery(
			internal.availabilityReminders.listReminderTargets,
			{},
		)) as Array<{
			organizationId: string;
			daysAhead: number;
			emailFromEmail?: string;
		}>;
		// Schedule all orgs in parallel — the scheduler calls are
		// independent and were previously sequential.
		await Promise.all(
			targets.map((t) =>
				ctx.scheduler.runAfter(
					0,
					internal.availabilityReminders.runForOrg,
					{
						organizationId: t.organizationId,
						daysAhead: t.daysAhead,
						emailFromEmail: t.emailFromEmail,
					},
				),
			),
		);
		return { scheduled: targets.length };
	},
});

/** Admin: queue reminders for this org now. */
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
				"Save notification settings first, then enable availability reminders",
			);
		}
		if (!settings.availabilityReminderEnabled) {
			throw new ConvexError("Enable availability reminders, then try again");
		}
		await ctx.scheduler.runAfter(0, internal.availabilityReminders.runForOrg, {
			organizationId: member.organizationId,
			daysAhead: Math.min(
				14,
				Math.max(1, settings.availabilityReminderDaysAhead ?? 7),
			),
			emailFromEmail: settings.emailFromEmail,
			force: args.force ?? false,
		});
		await logAudit(ctx, {
			organizationId: member.organizationId,
			userId: member.userId,
			action: "availability_reminder.sent_now",
			resourceType: "notificationSettings",
			resourceId: settings._id,
			oldValues: {},
			newValues: { force: args.force ?? false },
		});
		return { scheduled: true };
	},
});
