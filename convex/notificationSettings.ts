// Notification settings: per-organization Twilio/SES config.
//
// Source: backend/notifications/models.py::NotificationSettings
// One row per organization. twilioAuthToken is encrypted via
// convex/lib/crypto.ts (AES-256-GCM).

import { v, ConvexError } from "convex/values";
import {
	query,
	mutation,
	internalMutation,
} from "./_generated/server";
import type { FunctionReference } from "convex/server";
import { internal } from "./_generated/api";
import { internalRefs } from "./lib/internalRefs";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";
import { encrypt } from "./lib/crypto";


// ---- queries ----

export const get = query({
	args: {},
	handler: async (ctx) => {
		const member = await requireMembership(ctx);
		const row = await ctx.db
			.query("notificationSettings")
			.withIndex("by_org", (q) => q.eq("organizationId", member.organizationId))
			.first();
		if (!row) return null;
		// Don't leak the encrypted auth token to the client
		const { twilioAuthToken: _encrypted, ...safe } = row;
		return safe;
	},
});

// ---- mutations ----

export const upsert = mutation({
	args: {
		twilioEnabled: v.optional(v.boolean()),
		twilioAccountSid: v.optional(v.string()),
		twilioAuthToken: v.optional(v.string()), // plaintext — encrypted at rest
		twilioPhoneNumber: v.optional(v.string()),
		twilioMessagingServiceSid: v.optional(v.string()),
		whatsappEnabled: v.optional(v.boolean()),
		whatsappBusinessAccountId: v.optional(v.string()),
		whatsappPhoneNumberId: v.optional(v.string()),
		emailEnabled: v.optional(v.boolean()),
		emailFromName: v.optional(v.string()),
		emailFromEmail: v.optional(v.string()),
		useCompanyDefaults: v.optional(v.boolean()),
		requireSmsConsent: v.optional(v.boolean()),
		requireEmailConsent: v.optional(v.boolean()),
		maxRetries: v.optional(v.number()),
		retryDelayMinutes: v.optional(v.number()),
		staffingDigestEnabled: v.optional(v.boolean()),
		staffingDigestEmail: v.optional(v.string()),
		staffingDigestPhone: v.optional(v.string()),
		staffingDigestDaysAhead: v.optional(v.number()),
		availabilityReminderEnabled: v.optional(v.boolean()),
		availabilityReminderDaysAhead: v.optional(v.number()),
		assignmentNotifyEnabled: v.optional(v.boolean()),
		phoneRemindWithDigest: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		const encToken = args.twilioAuthToken
			? await encrypt(args.twilioAuthToken)
			: undefined;
		return await ctx.runMutation(
			internalRefs.notificationSettings.internalUpsert,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				plaintextAuthToken: args.twilioAuthToken,
				encryptedAuthToken: encToken,
				twilioAccountSid: args.twilioAccountSid,
				twilioEnabled: args.twilioEnabled,
				twilioPhoneNumber: args.twilioPhoneNumber,
				twilioMessagingServiceSid: args.twilioMessagingServiceSid,
				whatsappEnabled: args.whatsappEnabled,
				whatsappBusinessAccountId: args.whatsappBusinessAccountId,
				whatsappPhoneNumberId: args.whatsappPhoneNumberId,
				emailEnabled: args.emailEnabled,
				emailFromName: args.emailFromName,
				emailFromEmail: args.emailFromEmail,
				useCompanyDefaults: args.useCompanyDefaults,
				requireSmsConsent: args.requireSmsConsent,
				requireEmailConsent: args.requireEmailConsent,
				maxRetries: args.maxRetries,
				retryDelayMinutes: args.retryDelayMinutes,
				staffingDigestEnabled: args.staffingDigestEnabled,
				staffingDigestEmail: args.staffingDigestEmail,
				staffingDigestPhone: args.staffingDigestPhone,
				staffingDigestDaysAhead: args.staffingDigestDaysAhead,
				availabilityReminderEnabled: args.availabilityReminderEnabled,
				availabilityReminderDaysAhead: args.availabilityReminderDaysAhead,
				assignmentNotifyEnabled: args.assignmentNotifyEnabled,
				phoneRemindWithDigest: args.phoneRemindWithDigest,
			},
		);
	},
});

export const internalUpsert = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		plaintextAuthToken: v.optional(v.string()),
		encryptedAuthToken: v.optional(v.string()),
		twilioEnabled: v.optional(v.boolean()),
		twilioAccountSid: v.optional(v.string()),
		twilioPhoneNumber: v.optional(v.string()),
		twilioMessagingServiceSid: v.optional(v.string()),
		whatsappEnabled: v.optional(v.boolean()),
		whatsappBusinessAccountId: v.optional(v.string()),
		whatsappPhoneNumberId: v.optional(v.string()),
		emailEnabled: v.optional(v.boolean()),
		emailFromName: v.optional(v.string()),
		emailFromEmail: v.optional(v.string()),
		useCompanyDefaults: v.optional(v.boolean()),
		requireSmsConsent: v.optional(v.boolean()),
		requireEmailConsent: v.optional(v.boolean()),
		maxRetries: v.optional(v.number()),
		retryDelayMinutes: v.optional(v.number()),
		staffingDigestEnabled: v.optional(v.boolean()),
		staffingDigestEmail: v.optional(v.string()),
		staffingDigestPhone: v.optional(v.string()),
		staffingDigestDaysAhead: v.optional(v.number()),
		availabilityReminderEnabled: v.optional(v.boolean()),
		availabilityReminderDaysAhead: v.optional(v.number()),
		assignmentNotifyEnabled: v.optional(v.boolean()),
		phoneRemindWithDigest: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("notificationSettings")
			.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
			.first();
		const now = Date.now();

		const patch: Record<string, unknown> = { updatedAt: now };
		if (args.twilioEnabled !== undefined) patch.twilioEnabled = args.twilioEnabled;
		if (args.twilioAccountSid !== undefined)
			patch.twilioAccountSid = args.twilioAccountSid;
		if (args.encryptedAuthToken !== undefined)
			patch.twilioAuthToken = args.encryptedAuthToken;
		if (args.twilioPhoneNumber !== undefined)
			patch.twilioPhoneNumber = args.twilioPhoneNumber;
		if (args.twilioMessagingServiceSid !== undefined) {
			// Allow clearing: empty string → unset the field.
			patch.twilioMessagingServiceSid =
				args.twilioMessagingServiceSid.trim() === ""
					? undefined
					: args.twilioMessagingServiceSid;
		}
		if (args.whatsappEnabled !== undefined)
			patch.whatsappEnabled = args.whatsappEnabled;
		if (args.whatsappBusinessAccountId !== undefined)
			patch.whatsappBusinessAccountId = args.whatsappBusinessAccountId;
		if (args.whatsappPhoneNumberId !== undefined)
			patch.whatsappPhoneNumberId = args.whatsappPhoneNumberId;
		if (args.emailEnabled !== undefined) patch.emailEnabled = args.emailEnabled;
		if (args.emailFromName !== undefined) patch.emailFromName = args.emailFromName;
		if (args.emailFromEmail !== undefined) patch.emailFromEmail = args.emailFromEmail;
		if (args.useCompanyDefaults !== undefined)
			patch.useCompanyDefaults = args.useCompanyDefaults;
		if (args.requireSmsConsent !== undefined)
			patch.requireSmsConsent = args.requireSmsConsent;
		if (args.requireEmailConsent !== undefined)
			patch.requireEmailConsent = args.requireEmailConsent;
		if (args.maxRetries !== undefined) patch.maxRetries = args.maxRetries;
		if (args.retryDelayMinutes !== undefined)
			patch.retryDelayMinutes = args.retryDelayMinutes;
		if (args.staffingDigestEnabled !== undefined)
			patch.staffingDigestEnabled = args.staffingDigestEnabled;
		if (args.staffingDigestEmail !== undefined) {
			patch.staffingDigestEmail =
				args.staffingDigestEmail.trim() === ""
					? undefined
					: args.staffingDigestEmail.trim();
		}
		if (args.staffingDigestPhone !== undefined) {
			patch.staffingDigestPhone =
				args.staffingDigestPhone.trim() === ""
					? undefined
					: args.staffingDigestPhone.trim();
		}
		if (args.staffingDigestDaysAhead !== undefined) {
			const n = Math.floor(args.staffingDigestDaysAhead);
			if (n < 1 || n > 14) {
				throw new ConvexError("staffingDigestDaysAhead must be between 1 and 14");
			}
			patch.staffingDigestDaysAhead = n;
		}
		if (args.availabilityReminderEnabled !== undefined)
			patch.availabilityReminderEnabled = args.availabilityReminderEnabled;
		if (args.availabilityReminderDaysAhead !== undefined) {
			const n = Math.floor(args.availabilityReminderDaysAhead);
			if (n < 1 || n > 14) {
				throw new ConvexError(
					"availabilityReminderDaysAhead must be between 1 and 14",
				);
			}
			patch.availabilityReminderDaysAhead = n;
		}
		if (args.assignmentNotifyEnabled !== undefined)
			patch.assignmentNotifyEnabled = args.assignmentNotifyEnabled;
		if (args.phoneRemindWithDigest !== undefined)
			patch.phoneRemindWithDigest = args.phoneRemindWithDigest;

		if (existing) {
			await ctx.db.patch(existing._id, patch);
			// Build oldValues for every changed field (strip updatedAt).
			const oldValues: Record<string, unknown> = {};
			const newValues: Record<string, unknown> = {};
			for (const key of Object.keys(patch)) {
				if (key === "updatedAt") continue;
				oldValues[key] = (existing as Record<string, unknown>)[key];
				newValues[key] = patch[key];
			}
			await logAudit(ctx, {
				organizationId: args.organizationId,
				userId: args.userId,
				action: "notification_settings.updated",
				resourceType: "notificationSettings",
				resourceId: existing._id,
				oldValues,
				newValues,
			});
			return existing._id;
		}

		// Insert with safe defaults for any unspecified field
		const id = await ctx.db.insert("notificationSettings", {
			organizationId: args.organizationId,
			twilioEnabled: args.twilioEnabled ?? false,
			whatsappEnabled: args.whatsappEnabled ?? false,
			emailEnabled: args.emailEnabled ?? true,
			useCompanyDefaults: args.useCompanyDefaults ?? true,
			requireSmsConsent: args.requireSmsConsent ?? true,
			requireEmailConsent: args.requireEmailConsent ?? true,
			maxRetries: args.maxRetries ?? 3,
			retryDelayMinutes: args.retryDelayMinutes ?? 5,
			staffingDigestEnabled: args.staffingDigestEnabled ?? false,
			availabilityReminderEnabled: args.availabilityReminderEnabled ?? false,
			assignmentNotifyEnabled: args.assignmentNotifyEnabled ?? true,
			createdAt: now,
			updatedAt: now,
			...(patch as Record<string, unknown>),
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "notification_settings.created",
			resourceType: "notificationSettings",
			resourceId: id,
			oldValues: {},
			newValues: { ...patch },
		});
		return id;
	},
});

export const remove = mutation({
	args: {},
	handler: async (ctx) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRefs.notificationSettings.internalRemove,
			{ organizationId: member.organizationId, userId: member.userId },
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("notificationSettings")
			.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
			.first();
		if (!existing) throw new ConvexError("Settings not found");
		await ctx.db.delete(existing._id);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "notification_settings.deleted",
			resourceType: "notificationSettings",
			resourceId: existing._id,
			oldValues: {
				twilioEnabled: existing.twilioEnabled,
				emailEnabled: existing.emailEnabled,
				staffingDigestEnabled: existing.staffingDigestEnabled,
				availabilityReminderEnabled: existing.availabilityReminderEnabled,
			},
			newValues: {},
		});
		return existing._id;
	},
});
