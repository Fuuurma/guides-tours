// Notification templates: reusable message templates per (type, channel).
//
// Source: backend/notifications/models.py::NotificationTemplate
//         (and notifications/service.py for render pattern).
//
// The dispatcher (notification_dispatch.ts) reads templates by id
// through scheduledNotifications → notificationTemplates join.

import { v, ConvexError } from "convex/values";
import {
	query,
	mutation,
	internalMutation,
	internalAction,
	internalQuery,
} from "./_generated/server";
import type { FunctionReference } from "convex/server";
import { internal } from "./_generated/api";
import { internalRefs } from "./lib/internalRefs";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";
import {
	MAX_EMAIL_BODY_LEN,
	MAX_EMAIL_SUBJECT_LEN,
	MAX_NAME_LEN,
	MAX_SHORT_FIELD_LEN,
	MAX_SMS_BODY_LEN,
	assertFieldWithinLimit,
	normalizeEmail,
} from "./lib/validation";
import {
	renderNotification,
	type NotificationVars,
} from "./lib/notificationRender";
import { sendTemplatedEmail } from "./lib/sendEmail";
import { sendTwilioSms } from "./notification_sms";


// ---- queries ----

export const list = query({
	args: {
		templateType: v.optional(v.string()),
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		// Bound the result so an org with hundreds of templates
		// doesn't OOM the response. The FE page renders at most a
		// few dozen active templates.
		const MAX_TEMPLATES = 500;
		// Pick the most selective index. When both templateType and
		// isActive are set, the previous code overwrote the type query
		// with the active query — the type filter was silently dropped.
		let all;
		if (args.templateType && args.isActive !== undefined) {
			all = await ctx.db
				.query("notificationTemplates")
				.withIndex("by_org_type", (q) =>
					q
						.eq("organizationId", orgId)
						.eq("templateType", args.templateType!),
				)
				.take(MAX_TEMPLATES);
			all = all.filter((t) => t.isActive === args.isActive);
		} else if (args.templateType) {
			all = await ctx.db
				.query("notificationTemplates")
				.withIndex("by_org_type", (q) =>
					q
						.eq("organizationId", orgId)
						.eq("templateType", args.templateType!),
				)
				.take(MAX_TEMPLATES);
		} else if (args.isActive !== undefined) {
			all = await ctx.db
				.query("notificationTemplates")
				.withIndex("by_org_active", (q) =>
					q.eq("organizationId", orgId).eq("isActive", args.isActive!),
				)
				.take(MAX_TEMPLATES);
		} else {
			all = await ctx.db
				.query("notificationTemplates")
				.withIndex("by_org", (q) => q.eq("organizationId", orgId))
				.take(MAX_TEMPLATES);
		}
		return all;
	},
});

export const get = query({
	args: { templateId: v.id("notificationTemplates") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const t = await ctx.db.get(args.templateId);
		if (!t) throw new ConvexError("Template not found");
		if (t.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: template belongs to a different organization");
		}
		return t;
	},
});

// ---- mutations ----

export const create = mutation({
	args: {
		name: v.string(),
		templateType: v.string(),
		channel: v.string(),
		emailSubject: v.string(),
		emailBodyText: v.string(),
		emailBodyHtml: v.optional(v.string()),
		smsBody: v.optional(v.string()),
		variables: v.optional(v.array(v.string())),
		sendTiming: v.string(),
		timingValue: v.optional(v.number()),
		requireConsent: v.optional(v.boolean()),
		retryOnFailure: v.optional(v.boolean()),
		retryCount: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		return await ctx.runMutation(
			internalRefs.notificationTemplates.internalCreate,
			{ organizationId: member.organizationId, createdBy: member.userId, ...args },
		);
	},
});

export const internalCreate = internalMutation({
	args: {
		organizationId: v.string(),
		createdBy: v.optional(v.string()),
		name: v.string(),
		templateType: v.string(),
		channel: v.string(),
		emailSubject: v.string(),
		emailBodyText: v.string(),
		emailBodyHtml: v.optional(v.string()),
		smsBody: v.optional(v.string()),
		variables: v.optional(v.array(v.string())),
		sendTiming: v.string(),
		timingValue: v.optional(v.number()),
		requireConsent: v.optional(v.boolean()),
		retryOnFailure: v.optional(v.boolean()),
		retryCount: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		// Length validation on free-text fields. Email bodies can run
		// long (HTML) but the FE caps via maxLength; defending in depth
		// here keeps the table bounded.
		if (args.name.length > MAX_NAME_LEN) {
			throw new ConvexError(
				`Name is too long (max ${MAX_NAME_LEN} characters)`,
			);
		}
		assertFieldWithinLimit("templateType", args.templateType, MAX_SHORT_FIELD_LEN);
		assertFieldWithinLimit("channel", args.channel, MAX_SHORT_FIELD_LEN);
		assertFieldWithinLimit("sendTiming", args.sendTiming, MAX_SHORT_FIELD_LEN);
		assertFieldWithinLimit(
			"emailSubject",
			args.emailSubject,
			MAX_EMAIL_SUBJECT_LEN,
		);
		assertFieldWithinLimit(
			"emailBodyText",
			args.emailBodyText,
			MAX_EMAIL_BODY_LEN,
		);
		if (args.emailBodyHtml !== undefined) {
			assertFieldWithinLimit(
				"emailBodyHtml",
				args.emailBodyHtml,
				MAX_EMAIL_BODY_LEN,
			);
		}
		if (args.smsBody !== undefined) {
			assertFieldWithinLimit(
				"smsBody",
				args.smsBody,
				MAX_SMS_BODY_LEN,
			);
		}

		const now = Date.now();
		const id = await ctx.db.insert("notificationTemplates", {
			organizationId: args.organizationId,
			name: args.name,
			templateType: args.templateType,
			channel: args.channel,
			isActive: true,
			isDefault: false,
			emailSubject: args.emailSubject,
			emailBodyText: args.emailBodyText,
			emailBodyHtml: args.emailBodyHtml ?? "",
			smsBody: args.smsBody ?? "",
			variables: args.variables ?? [],
			sendTiming: args.sendTiming,
			timingValue: args.timingValue,
			requireConsent: args.requireConsent ?? false,
			retryOnFailure: args.retryOnFailure ?? true,
			retryCount: args.retryCount ?? 3,
			createdAt: now,
			updatedAt: now,
			createdBy: args.createdBy,
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.createdBy ?? "system",
			action: "notification_template.created",
			resourceType: "notificationTemplate",
			resourceId: id,
			oldValues: {},
			newValues: { name: args.name, templateType: args.templateType },
		});
		return id;
	},
});

export const update = mutation({
	args: {
		templateId: v.id("notificationTemplates"),
		name: v.optional(v.string()),
		channel: v.optional(v.string()),
		isActive: v.optional(v.boolean()),
		emailSubject: v.optional(v.string()),
		emailBodyText: v.optional(v.string()),
		emailBodyHtml: v.optional(v.string()),
		smsBody: v.optional(v.string()),
		variables: v.optional(v.array(v.string())),
		sendTiming: v.optional(v.string()),
		timingValue: v.optional(v.number()),
		requireConsent: v.optional(v.boolean()),
		retryOnFailure: v.optional(v.boolean()),
		retryCount: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		const { templateId, ...rest } = args;
		return await ctx.runMutation(
			internalRefs.notificationTemplates.internalUpdate,
			{ organizationId: member.organizationId, userId: member.userId, templateId, ...rest },
		);
	},
});

export const internalUpdate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		templateId: v.id("notificationTemplates"),
		name: v.optional(v.string()),
		channel: v.optional(v.string()),
		isActive: v.optional(v.boolean()),
		emailSubject: v.optional(v.string()),
		emailBodyText: v.optional(v.string()),
		emailBodyHtml: v.optional(v.string()),
		smsBody: v.optional(v.string()),
		variables: v.optional(v.array(v.string())),
		sendTiming: v.optional(v.string()),
		timingValue: v.optional(v.number()),
		requireConsent: v.optional(v.boolean()),
		retryOnFailure: v.optional(v.boolean()),
		retryCount: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.templateId);
		if (!existing) throw new ConvexError("Template not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}

		// Same length caps as the create path.
		if (args.name !== undefined && args.name.length > MAX_NAME_LEN) {
			throw new ConvexError(
				`Name is too long (max ${MAX_NAME_LEN} characters)`,
			);
		}
		if (args.channel !== undefined) {
			assertFieldWithinLimit("channel", args.channel, MAX_SHORT_FIELD_LEN);
		}
		if (args.sendTiming !== undefined) {
			assertFieldWithinLimit("sendTiming", args.sendTiming, MAX_SHORT_FIELD_LEN);
		}
		if (args.emailSubject !== undefined) {
			assertFieldWithinLimit(
				"emailSubject",
				args.emailSubject,
				MAX_EMAIL_SUBJECT_LEN,
			);
		}
		if (args.emailBodyText !== undefined) {
			assertFieldWithinLimit(
				"emailBodyText",
				args.emailBodyText,
				MAX_EMAIL_BODY_LEN,
			);
		}
		if (args.emailBodyHtml !== undefined) {
			assertFieldWithinLimit(
				"emailBodyHtml",
				args.emailBodyHtml,
				MAX_EMAIL_BODY_LEN,
			);
		}
		if (args.smsBody !== undefined) {
			assertFieldWithinLimit(
				"smsBody",
				args.smsBody,
				MAX_SMS_BODY_LEN,
			);
		}

		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		for (const field of [
			"name",
			"channel",
			"isActive",
			"emailSubject",
			"emailBodyText",
			"emailBodyHtml",
			"smsBody",
			"variables",
			"sendTiming",
			"timingValue",
			"requireConsent",
			"retryOnFailure",
			"retryCount",
		]) {
			const value = (args as Record<string, unknown>)[field];
			if (value !== undefined) patch[field] = value;
		}
		await ctx.db.patch(args.templateId, patch);
		// Log old values for every changed field (not just name).
		const oldValues: Record<string, unknown> = {};
		for (const key of Object.keys(patch)) {
			if (key === "updatedAt") continue;
			oldValues[key] = (existing as Record<string, unknown>)[key];
		}
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "notification_template.updated",
			resourceType: "notificationTemplate",
			resourceId: args.templateId,
			oldValues,
			newValues: patch,
		});
		return args.templateId;
	},
});

export const remove = mutation({
	args: { templateId: v.id("notificationTemplates") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRefs.notificationTemplates.internalRemove,
			{ organizationId: member.organizationId, userId: member.userId, templateId: args.templateId },
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		templateId: v.id("notificationTemplates"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.templateId);
		if (!existing) throw new ConvexError("Template not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.delete(args.templateId);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "notification_template.deleted",
			resourceType: "notificationTemplate",
			resourceId: args.templateId,
			oldValues: {
				name: existing.name,
				channel: existing.channel,
				isActive: existing.isActive,
				sendTiming: existing.sendTiming,
			},
			newValues: {},
		});
		return args.templateId;
	},
});

const SAMPLE_VARS: NotificationVars = {
	customerName: "Alex Guest",
	tourName: "Old Town Walk",
	date: "2026-08-15",
	startTime: "10:00",
};

/** Live preview with sample (or override) placeholder values. */
export const preview = query({
	args: {
		templateId: v.id("notificationTemplates"),
		customerName: v.optional(v.string()),
		tourName: v.optional(v.string()),
		date: v.optional(v.string()),
		startTime: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const t = await ctx.db.get(args.templateId);
		if (!t) throw new ConvexError("Template not found");
		if (t.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		const vars: NotificationVars = {
			customerName: args.customerName?.trim() || SAMPLE_VARS.customerName,
			tourName: args.tourName?.trim() || SAMPLE_VARS.tourName,
			date: args.date?.trim() || SAMPLE_VARS.date,
			startTime: args.startTime?.trim() || SAMPLE_VARS.startTime,
		};
		return {
			vars,
			rendered: renderNotification(
				{
					templateType: t.templateType,
					emailSubject: t.emailSubject,
					emailBodyText: t.emailBodyText,
					emailBodyHtml: t.emailBodyHtml,
					smsBody: t.smsBody,
				},
				vars,
			),
		};
	},
});

/**
 * Queue a test send to an override address/phone.
 * Uses the same SES/Twilio path as real notifications.
 */
export const sendTest = mutation({
	args: {
		templateId: v.id("notificationTemplates"),
		channel: v.union(v.literal("email"), v.literal("sms")),
		to: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		const t = await ctx.db.get(args.templateId);
		if (!t) throw new ConvexError("Template not found");
		if (t.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		const toRaw = args.to.trim();
		if (!toRaw) {
			throw new ConvexError(
				args.channel === "email"
					? "Enter an email address for the test send"
					: "Enter a phone number for the test SMS",
			);
		}
		let to = toRaw;
		if (args.channel === "email") {
			const normalized = normalizeEmail(toRaw);
			if (!normalized) {
				throw new ConvexError("Invalid email address for test send");
			}
			to = normalized;
		} else {
			// Soft E.164-ish check — Twilio needs a dialable number.
			const digits = toRaw.replace(/[^\d+]/g, "");
			if (!/^\+?\d{8,15}$/.test(digits)) {
				throw new ConvexError(
					"Enter a valid phone number with country code (e.g. +15551234567)",
				);
			}
			to = digits.startsWith("+") ? digits : `+${digits}`;
		}
		await ctx.scheduler.runAfter(
			0,
			internal.notificationTemplates.sendTestInternal as unknown as Parameters<
				typeof ctx.scheduler.runAfter
			>[2],
			{
				organizationId: member.organizationId,
				userId: member.userId,
				templateId: args.templateId,
				channel: args.channel,
				to,
			},
		);
		return { queued: true as const };
	},
});

export const getTemplateForTest = internalQuery({
	args: {
		organizationId: v.string(),
		templateId: v.id("notificationTemplates"),
	},
	handler: async (ctx, args) => {
		const t = await ctx.db.get(args.templateId);
		if (!t || t.organizationId !== args.organizationId) return null;
		return t;
	},
});

export const sendTestInternal = internalAction({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		templateId: v.id("notificationTemplates"),
		channel: v.union(v.literal("email"), v.literal("sms")),
		to: v.string(),
	},
	handler: async (ctx, args) => {
		const t = await ctx.runQuery(
			internal.notificationTemplates.getTemplateForTest,
			{
				organizationId: args.organizationId,
				templateId: args.templateId,
			},
		);
		if (!t) throw new ConvexError("Template not found");

		const rendered = renderNotification(
			{
				templateType: t.templateType,
				emailSubject: t.emailSubject,
				emailBodyText: t.emailBodyText,
				emailBodyHtml: t.emailBodyHtml,
				smsBody: t.smsBody,
			},
			SAMPLE_VARS,
		);

		if (args.channel === "email") {
			const result = await sendTemplatedEmail({
				to: args.to,
				subject: `[TEST] ${rendered.subject}`,
				bodyText: rendered.bodyText,
				bodyHtml: rendered.bodyHtml,
			});
			await ctx.runMutation(
				internal.notificationTemplates.recordTestLog as unknown as Parameters<
					typeof ctx.runMutation
				>[0],
				{
					organizationId: args.organizationId,
					userId: args.userId,
					templateId: args.templateId,
					templateName: t.name,
					channel: "email",
					recipient: args.to,
					status:
						result.status === "sent"
							? "sent"
							: result.status === "skipped"
								? "skipped"
								: "failed",
					errorMessage:
						result.status === "failed"
							? result.error
							: result.status === "skipped"
								? result.reason
								: undefined,
				},
			);
			return result;
		}

		const smsResult = await sendTwilioSms(ctx, {
			organizationId: args.organizationId,
			to: args.to,
			body: `[TEST] ${rendered.smsBody}`,
			recipientName: "Test",
		});
		await ctx.runMutation(
			internal.notificationTemplates.recordTestLog as unknown as Parameters<
				typeof ctx.runMutation
			>[0],
			{
				organizationId: args.organizationId,
				userId: args.userId,
				templateId: args.templateId,
				templateName: t.name,
				channel: "sms",
				recipient: args.to,
				status: smsResult.ok ? "sent" : "failed",
				errorMessage: smsResult.ok ? undefined : smsResult.error,
			},
		);
		return smsResult;
	},
});

export const recordTestLog = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		templateId: v.id("notificationTemplates"),
		templateName: v.string(),
		channel: v.string(),
		recipient: v.string(),
		status: v.string(),
		errorMessage: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const logId = await ctx.db.insert("notificationLogs", {
			organizationId: args.organizationId,
			templateId: args.templateId,
			templateName: `[TEST] ${args.templateName}`,
			channel: args.channel,
			recipient: args.recipient,
			status: args.status,
			errorMessage: args.errorMessage,
			sentAt: now,
			metadata: { test: true, userId: args.userId },
			createdAt: now,
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "notification_template.test_sent",
			resourceType: "notificationTemplate",
			resourceId: args.templateId,
			oldValues: {},
			// PII: don't log recipient (email/phone).
			newValues: {
				channel: args.channel,
				status: args.status,
			},
		});
		return logId;
	},
});
