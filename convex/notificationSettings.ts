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

// ----- Patch assembly (data-driven so new fields are one list entry) -----

/** Fields copied verbatim when present: [argsKey, patchKey]. Only
 *  twilioAuthToken is renamed (args.encryptedAuthToken). */
const PASSTHROUGH_FIELDS: ReadonlyArray<readonly [string, string]> = [
	["twilioEnabled", "twilioEnabled"],
	["twilioAccountSid", "twilioAccountSid"],
	["encryptedAuthToken", "twilioAuthToken"],
	["twilioPhoneNumber", "twilioPhoneNumber"],
	["whatsappEnabled", "whatsappEnabled"],
	["whatsappBusinessAccountId", "whatsappBusinessAccountId"],
	["whatsappPhoneNumberId", "whatsappPhoneNumberId"],
	["emailEnabled", "emailEnabled"],
	["emailFromName", "emailFromName"],
	["emailFromEmail", "emailFromEmail"],
	["useCompanyDefaults", "useCompanyDefaults"],
	["requireSmsConsent", "requireSmsConsent"],
	["requireEmailConsent", "requireEmailConsent"],
	["maxRetries", "maxRetries"],
	["retryDelayMinutes", "retryDelayMinutes"],
	["staffingDigestEnabled", "staffingDigestEnabled"],
	["availabilityReminderEnabled", "availabilityReminderEnabled"],
	["assignmentNotifyEnabled", "assignmentNotifyEnabled"],
	["phoneRemindWithDigest", "phoneRemindWithDigest"],
];

/** Empty string clears the field; otherwise the value stored as-is. */
const CLEAR_IF_BLANK_FIELDS = ["twilioMessagingServiceSid"] as const;

/** Empty string clears the field; otherwise the trimmed value. */
const TRIM_OR_CLEAR_FIELDS = [
	"staffingDigestEmail",
	"staffingDigestPhone",
] as const;

/** Integer fields bounded to 1..14 (ConvexError outside). */
const BOUNDED_INT_FIELDS = [
	"staffingDigestDaysAhead",
	"availabilityReminderDaysAhead",
] as const;

function buildNotificationPatch(
	args: Record<string, unknown>,
): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	for (const [argsKey, patchKey] of PASSTHROUGH_FIELDS) {
		if (args[argsKey] !== undefined) patch[patchKey] = args[argsKey];
	}
	for (const key of CLEAR_IF_BLANK_FIELDS) {
		const value = args[key];
		if (value !== undefined) {
			patch[key] =
				typeof value === "string" && value.trim() === "" ? undefined : value;
		}
	}
	for (const key of TRIM_OR_CLEAR_FIELDS) {
		const value = args[key];
		if (value !== undefined) {
			patch[key] =
				typeof value === "string" && value.trim() === ""
					? undefined
					: (value as string).trim();
		}
	}
	for (const key of BOUNDED_INT_FIELDS) {
		const value = args[key];
		if (value !== undefined) {
			const n = Math.floor(value as number);
			if (n < 1 || n > 14) {
				throw new ConvexError(`${key} must be between 1 and 14`);
			}
			patch[key] = n;
		}
	}
	return patch;
}

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

		const patch: Record<string, unknown> = {
			updatedAt: now,
			...buildNotificationPatch(args),
		};

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
