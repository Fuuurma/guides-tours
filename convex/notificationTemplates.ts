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
} from "./_generated/server";
import type { FunctionReference } from "convex/server";
import { requireMembership, requireRole } from "./lib/authz";

// ---- queries ----

export const list = query({
	args: {
		templateType: v.optional(v.string()),
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		let q = ctx.db
			.query("notificationTemplates")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId));
		if (args.templateType) {
			q = ctx.db
				.query("notificationTemplates")
				.withIndex("by_org_type", (q) =>
					q
						.eq("organizationId", orgId)
						.eq("templateType", args.templateType!),
				);
		}
		if (args.isActive !== undefined) {
			q = ctx.db
				.query("notificationTemplates")
				.withIndex("by_org_active", (q) =>
					q.eq("organizationId", orgId).eq("isActive", args.isActive!),
				);
		}
		return await q.collect();
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
			internalCreate as unknown as FunctionReference<"mutation", "public" | "internal">,
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
		await ctx.db.insert("auditLogs", {
			organizationId: args.organizationId,
			userId: args.createdBy ?? "system",
			action: "notification_template.created",
			resourceType: "notificationTemplate",
			resourceId: id,
			oldValues: {},
			newValues: { name: args.name, templateType: args.templateType },
			timestamp: now,
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
			internalUpdate as unknown as FunctionReference<"mutation", "public" | "internal">,
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
		await ctx.db.insert("auditLogs", {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "notification_template.updated",
			resourceType: "notificationTemplate",
			resourceId: args.templateId,
			oldValues: { name: existing.name },
			newValues: patch,
			timestamp: Date.now(),
		});
		return args.templateId;
	},
});

export const remove = mutation({
	args: { templateId: v.id("notificationTemplates") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
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
		await ctx.db.insert("auditLogs", {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "notification_template.deleted",
			resourceType: "notificationTemplate",
			resourceId: args.templateId,
			oldValues: { name: existing.name },
			newValues: {},
			timestamp: Date.now(),
		});
		return args.templateId;
	},
});
