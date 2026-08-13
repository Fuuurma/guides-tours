/**
 * Notify guides and drivers when they are assigned or unassigned.
 *
 * Lookup via Better Auth adapter (guides) or drivers.userId → user
 * (drivers). Email + optional SMS; log to notificationLogs.
 * Honors notificationSettings.assignmentNotifyEnabled (default on).
 */

import { v, ConvexError } from "convex/values";
import {
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";
import { sendTemplatedEmail } from "./lib/sendEmail";
import { sendTwilioSms } from "./notification_sms";
import { dashboardUrl } from "./lib/siteUrl";

export type AssignmentNotifyEvent = "created" | "cancelled" | "reassigned_away";

export function formatAssignmentNotify(input: {
	guideName: string;
	tourName: string;
	date: string;
	startTime: string;
	endTime?: string;
	event: AssignmentNotifyEvent;
	assignmentUrl: string;
}): { subject: string; bodyText: string; smsBody: string } {
	const when = `${input.date} at ${input.startTime}${
		input.endTime ? `–${input.endTime}` : ""
	}`;
	if (input.event === "created") {
		const subject = `You're assigned · ${input.tourName} · ${input.date}`;
		const bodyText = [
			`Hi ${input.guideName},`,
			"",
			`You've been assigned to ${input.tourName} on ${when}.`,
			"",
			`View assignment: ${input.assignmentUrl}`,
			"",
			"Please confirm your availability if you haven't already.",
		].join("\n");
		const smsBody = `Assigned: ${input.tourName} ${when}. ${input.assignmentUrl}`;
		return { subject, bodyText, smsBody };
	}
	if (input.event === "reassigned_away") {
		const subject = `Assignment changed · ${input.tourName} · ${input.date}`;
		const bodyText = [
			`Hi ${input.guideName},`,
			"",
			`You're no longer assigned to ${input.tourName} on ${when} (reassigned to another guide).`,
			"",
			`Dashboard: ${input.assignmentUrl}`,
		].join("\n");
		const smsBody = `No longer assigned: ${input.tourName} ${when}.`;
		return { subject, bodyText, smsBody };
	}
	const subject = `Assignment cancelled · ${input.tourName} · ${input.date}`;
	const bodyText = [
		`Hi ${input.guideName},`,
		"",
		`Your assignment for ${input.tourName} on ${when} was cancelled.`,
		"",
		`Details: ${input.assignmentUrl}`,
	].join("\n");
	const smsBody = `Cancelled: ${input.tourName} ${when}.`;
	return { subject, bodyText, smsBody };
}

export function formatDriverAssignmentNotify(input: {
	driverName: string;
	tourName: string;
	date: string;
	startTime: string;
	endTime?: string;
	event: AssignmentNotifyEvent;
	assignmentUrl: string;
}): { subject: string; bodyText: string; smsBody: string } {
	const when = `${input.date} at ${input.startTime}${
		input.endTime ? `–${input.endTime}` : ""
	}`;
	if (input.event === "created") {
		const subject = `Driving assignment · ${input.tourName} · ${input.date}`;
		const bodyText = [
			`Hi ${input.driverName},`,
			"",
			`You've been assigned as driver for ${input.tourName} on ${when}.`,
			"",
			`View assignment: ${input.assignmentUrl}`,
		].join("\n");
		const smsBody = `Driving: ${input.tourName} ${when}. ${input.assignmentUrl}`;
		return { subject, bodyText, smsBody };
	}
	if (input.event === "reassigned_away") {
		const subject = `Driving assignment changed · ${input.tourName} · ${input.date}`;
		const bodyText = [
			`Hi ${input.driverName},`,
			"",
			`You're no longer the driver for ${input.tourName} on ${when}.`,
			"",
			`Dashboard: ${input.assignmentUrl}`,
		].join("\n");
		const smsBody = `No longer driving: ${input.tourName} ${when}.`;
		return { subject, bodyText, smsBody };
	}
	const subject = `Driving assignment cancelled · ${input.tourName} · ${input.date}`;
	const bodyText = [
		`Hi ${input.driverName},`,
		"",
		`Your driving assignment for ${input.tourName} on ${when} was cancelled.`,
		"",
		`Details: ${input.assignmentUrl}`,
	].join("\n");
	const smsBody = `Driving cancelled: ${input.tourName} ${when}.`;
	return { subject, bodyText, smsBody };
}

export const getOrgNotifySettings = internalQuery({
	args: { organizationId: v.string() },
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("notificationSettings")
			.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
			.first();
		if (!row) {
			return {
				emailFromEmail: undefined as string | undefined,
				assignmentNotifyEnabled: true,
			};
		}
		return {
			emailFromEmail: row.emailFromEmail,
			// Default on when unset (opt-out).
			assignmentNotifyEnabled: row.assignmentNotifyEnabled !== false,
		};
	},
});

export const recordLog = internalMutation({
	args: {
		organizationId: v.string(),
		channel: v.string(),
		recipient: v.string(),
		status: v.string(),
		event: v.string(),
		assignmentId: v.optional(v.string()),
		guideId: v.optional(v.string()),
		driverId: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const role = args.driverId ? "driver" : "guide";
		await ctx.db.insert("notificationLogs", {
			organizationId: args.organizationId,
			templateName: `assignment_${role}_${args.event}`,
			channel: args.channel,
			recipient: args.recipient,
			status: args.status,
			errorMessage: args.errorMessage,
			metadata: {
				assignmentId: args.assignmentId ?? "",
				guideId: args.guideId ?? "",
				driverId: args.driverId ?? "",
				event: args.event,
				role,
			},
			createdAt: now,
		});
	},
});

export const getDriverUserId = internalQuery({
	args: {
		organizationId: v.string(),
		driverId: v.id("drivers"),
	},
	handler: async (ctx, args) => {
		const driver = await ctx.db.get(args.driverId);
		if (!driver) return null;
		if (driver.organizationId !== args.organizationId) return null;
		return { userId: driver.userId, driverId: driver._id };
	},
});

type NotifyUserArgs = {
	organizationId: string;
	assignmentId: string;
	userId: string;
	event: AssignmentNotifyEvent;
	subject: string;
	bodyText: string;
	smsBody: string;
	guideId?: string;
	driverId?: string;
	emailFromEmail?: string;
};

type DeliverCtx = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	runQuery: (ref: any, args: any) => Promise<any>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	runMutation: (ref: any, args: any) => Promise<any>;
};

async function deliverToUser(
	ctx: DeliverCtx,
	args: NotifyUserArgs,
): Promise<{
	skipped: boolean;
	reason?: string;
	email?: string;
	sms?: string | null;
}> {
	const user = (await ctx.runQuery(
		components.betterAuth.adapter.findOne as never,
		{
			model: "user" as never,
			where: [{ field: "_id", value: args.userId }] as never,
		},
	)) as {
		email?: string | null;
		name?: string | null;
		phone?: string | null;
	} | null;

	if (!user?.email) {
		await ctx.runMutation(internal.assignmentNotifications.recordLog, {
			organizationId: args.organizationId,
			channel: "email",
			recipient: args.userId,
			status: "skipped",
			event: args.event,
			assignmentId: args.assignmentId,
			guideId: args.guideId,
			driverId: args.driverId,
			errorMessage: args.driverId
				? "Driver has no email"
				: "Guide has no email",
		});
		return { skipped: true, reason: "no_email" };
	}

	const displayName = user.name?.trim() || user.email;
	const sent = await sendTemplatedEmail({
		to: user.email,
		subject: args.subject,
		bodyText: args.bodyText,
		from: args.emailFromEmail,
	});
	await ctx.runMutation(internal.assignmentNotifications.recordLog, {
		organizationId: args.organizationId,
		channel: "email",
		recipient: user.email,
		status: sent.status === "sent" ? "sent" : sent.status,
		event: args.event,
		assignmentId: args.assignmentId,
		guideId: args.guideId,
		driverId: args.driverId,
		errorMessage:
			sent.status === "failed"
				? sent.error
				: sent.status === "skipped"
					? sent.reason
					: undefined,
	});

	const phone = (user.phone ?? "").trim();
	let smsStatus: string | null = null;
	if (phone) {
		const sms = await sendTwilioSms(ctx, {
			organizationId: args.organizationId,
			to: phone,
			body: args.smsBody,
			recipientName: displayName,
		});
		smsStatus = sms.ok ? "sent" : (sms.error ?? "failed");
		await ctx.runMutation(internal.assignmentNotifications.recordLog, {
			organizationId: args.organizationId,
			channel: "sms",
			recipient: phone,
			status: sms.ok ? "sent" : "failed",
			event: args.event,
			assignmentId: args.assignmentId,
			guideId: args.guideId,
			driverId: args.driverId,
			errorMessage: sms.ok ? undefined : sms.error,
		});
	}

	return {
		skipped: false,
		email: sent.status,
		sms: smsStatus,
	};
}

const eventValidator = v.union(
	v.literal("created"),
	v.literal("cancelled"),
	v.literal("reassigned_away"),
);

export const notifyGuide = internalAction({
	args: {
		organizationId: v.string(),
		assignmentId: v.string(),
		guideId: v.string(),
		event: eventValidator,
		tourName: v.string(),
		date: v.string(),
		startTime: v.string(),
		endTime: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const settings = (await ctx.runQuery(
			internal.assignmentNotifications.getOrgNotifySettings,
			{ organizationId: args.organizationId },
		)) as {
			emailFromEmail?: string;
			assignmentNotifyEnabled: boolean;
		};

		if (!settings.assignmentNotifyEnabled) {
			return { skipped: true, reason: "disabled" };
		}

		const user = (await ctx.runQuery(
			components.betterAuth.adapter.findOne as never,
			{
				model: "user" as never,
				where: [{ field: "_id", value: args.guideId }] as never,
			},
		)) as {
			email?: string | null;
			name?: string | null;
			phone?: string | null;
		} | null;

		const guideName = user?.name?.trim() || user?.email || "Guide";
		const assignmentUrl = dashboardUrl(
			`/dashboard/assignments/${args.assignmentId}`,
		);
		const { subject, bodyText, smsBody } = formatAssignmentNotify({
			guideName,
			tourName: args.tourName,
			date: args.date,
			startTime: args.startTime,
			endTime: args.endTime,
			event: args.event,
			assignmentUrl,
		});

		return await deliverToUser(ctx, {
			organizationId: args.organizationId,
			assignmentId: args.assignmentId,
			userId: args.guideId,
			event: args.event,
			subject,
			bodyText,
			smsBody,
			guideId: args.guideId,
			emailFromEmail: settings.emailFromEmail,
		});
	},
});

export const notifyDriver = internalAction({
	args: {
		organizationId: v.string(),
		assignmentId: v.string(),
		driverId: v.id("drivers"),
		event: eventValidator,
		tourName: v.string(),
		date: v.string(),
		startTime: v.string(),
		endTime: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const settings = (await ctx.runQuery(
			internal.assignmentNotifications.getOrgNotifySettings,
			{ organizationId: args.organizationId },
		)) as {
			emailFromEmail?: string;
			assignmentNotifyEnabled: boolean;
		};

		if (!settings.assignmentNotifyEnabled) {
			return { skipped: true, reason: "disabled" };
		}

		const driver = (await ctx.runQuery(
			internal.assignmentNotifications.getDriverUserId,
			{
				organizationId: args.organizationId,
				driverId: args.driverId as Id<"drivers">,
			},
		)) as { userId: string; driverId: Id<"drivers"> } | null;

		if (!driver) {
			await ctx.runMutation(internal.assignmentNotifications.recordLog, {
				organizationId: args.organizationId,
				channel: "email",
				recipient: args.driverId,
				status: "skipped",
				event: args.event,
				assignmentId: args.assignmentId,
				driverId: args.driverId,
				errorMessage: "Driver not found",
			});
			return { skipped: true, reason: "no_driver" };
		}

		const user = (await ctx.runQuery(
			components.betterAuth.adapter.findOne as never,
			{
				model: "user" as never,
				where: [{ field: "_id", value: driver.userId }] as never,
			},
		)) as {
			email?: string | null;
			name?: string | null;
			phone?: string | null;
		} | null;

		const driverName = user?.name?.trim() || user?.email || "Driver";
		const assignmentUrl = dashboardUrl(
			`/dashboard/assignments/${args.assignmentId}`,
		);
		const { subject, bodyText, smsBody } = formatDriverAssignmentNotify({
			driverName,
			tourName: args.tourName,
			date: args.date,
			startTime: args.startTime,
			endTime: args.endTime,
			event: args.event,
			assignmentUrl,
		});

		return await deliverToUser(ctx, {
			organizationId: args.organizationId,
			assignmentId: args.assignmentId,
			userId: driver.userId,
			event: args.event,
			subject,
			bodyText,
			smsBody,
			driverId: args.driverId,
			emailFromEmail: settings.emailFromEmail,
		});
	},
});

/**
 * Admin: queue a sample assignment notification to yourself
 * (email + SMS if you have a phone). Works even when the org toggle
 * is off so you can verify delivery before enabling.
 */
export const sendTest = mutation({
	args: {
		role: v.optional(v.union(v.literal("guide"), v.literal("driver"))),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		const role = args.role ?? "guide";
		await ctx.scheduler.runAfter(
			0,
			internal.assignmentNotifications.sendTestInternal as unknown as Parameters<
				typeof ctx.scheduler.runAfter
			>[1],
			{
				organizationId: member.organizationId,
				userId: member.userId,
				role,
			},
		);
		const settings = await ctx.db
			.query("notificationSettings")
			.withIndex("by_org", (q) => q.eq("organizationId", member.organizationId))
			.first();
		await logAudit(ctx, {
			organizationId: member.organizationId,
			userId: member.userId,
			action: "assignment_notify.test_sent",
			resourceType: "notificationSettings",
			resourceId: settings?._id ?? member.organizationId,
			oldValues: {},
			newValues: { role },
		});
		return { queued: true as const };
	},
});

/**
 * Re-notify guide and/or driver on an existing scheduled assignment
 * (e.g. after they added a phone, or a prior delivery failed).
 * Honors assignmentNotifyEnabled.
 */
export const resend = mutation({
	args: {
		assignmentId: v.id("assignments"),
		target: v.optional(
			v.union(v.literal("guide"), v.literal("driver"), v.literal("both")),
		),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		const a = await ctx.db.get(args.assignmentId);
		if (!a || a.deletedAt) throw new ConvexError("Assignment not found");
		if (a.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		if (a.status !== "scheduled") {
			throw new ConvexError("Can only resend for scheduled assignments");
		}

		const settings = await ctx.db
			.query("notificationSettings")
			.withIndex("by_org", (q) => q.eq("organizationId", member.organizationId))
			.first();
		if (settings?.assignmentNotifyEnabled === false) {
			throw new ConvexError(
				"Assignment notifications are disabled in settings",
			);
		}

		const tour = await ctx.db.get(a.tourId);
		const tourName = tour?.name ?? "Tour";
		const target = args.target ?? "both";
		const base = {
			organizationId: a.organizationId,
			assignmentId: args.assignmentId,
			tourName,
			date: a.date,
			startTime: a.startTime,
			endTime: a.endTime,
			event: "created" as const,
		};

		let guideQueued = false;
		let driverQueued = false;

		if (target === "guide" || target === "both") {
			await ctx.scheduler.runAfter(
				0,
				internal.assignmentNotifications.notifyGuide as unknown as Parameters<
					typeof ctx.scheduler.runAfter
				>[1],
				{ ...base, guideId: a.guideId },
			);
			guideQueued = true;
		}
		if ((target === "driver" || target === "both") && a.driverId) {
			await ctx.scheduler.runAfter(
				0,
				internal.assignmentNotifications.notifyDriver as unknown as Parameters<
					typeof ctx.scheduler.runAfter
				>[1],
				{ ...base, driverId: a.driverId },
			);
			driverQueued = true;
		}
		if (target === "driver" && !a.driverId) {
			throw new ConvexError("This assignment has no driver to notify");
		}

		await logAudit(ctx, {
			organizationId: member.organizationId,
			userId: member.userId,
			action: "assignment_notify.resent",
			resourceType: "assignment",
			resourceId: args.assignmentId,
			oldValues: {},
			newValues: { target, guideQueued, driverQueued },
		});

		return { guideQueued, driverQueued };
	},
});

export const sendTestInternal = internalAction({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		role: v.union(v.literal("guide"), v.literal("driver")),
	},
	handler: async (ctx, args) => {
		const settings = (await ctx.runQuery(
			internal.assignmentNotifications.getOrgNotifySettings,
			{ organizationId: args.organizationId },
		)) as {
			emailFromEmail?: string;
			assignmentNotifyEnabled: boolean;
		};

		const user = (await ctx.runQuery(
			components.betterAuth.adapter.findOne as never,
			{
				model: "user" as never,
				where: [{ field: "_id", value: args.userId }] as never,
			},
		)) as {
			email?: string | null;
			name?: string | null;
			phone?: string | null;
		} | null;

		const displayName = user?.name?.trim() || user?.email || "You";
		const assignmentUrl = dashboardUrl("/dashboard/assignments");
		const sample = {
			tourName: "Sample Tour (test)",
			date: "2099-01-01",
			startTime: "09:00",
			endTime: "11:00",
			assignmentUrl,
		};

		const formatted =
			args.role === "driver"
				? formatDriverAssignmentNotify({
						driverName: displayName,
						event: "created",
						...sample,
					})
				: formatAssignmentNotify({
						guideName: displayName,
						event: "created",
						...sample,
					});

		const subject = `[TEST] ${formatted.subject}`;
		const bodyText = [
			"This is a test assignment notification from your org settings.",
			"",
			formatted.bodyText,
		].join("\n");
		const smsBody = `[TEST] ${formatted.smsBody}`;

		return await deliverToUser(ctx, {
			organizationId: args.organizationId,
			assignmentId: "test",
			userId: args.userId,
			event: "created",
			subject,
			bodyText,
			smsBody,
			guideId: args.role === "guide" ? args.userId : undefined,
			driverId: args.role === "driver" ? "test" : undefined,
			emailFromEmail: settings.emailFromEmail,
		});
	},
});
