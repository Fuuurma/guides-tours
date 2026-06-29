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

/**
 * @internal
 * No FE caller. The settings page (`settings/payments.tsx` and the
 * notifications settings page) uses separate `upsert` mutations instead
 * of fetching the decrypted token back to the client. The decryption
 * happens server-side at dispatch time, so the FE never needs the
 * raw secret.
 * See docs/DATA_LAYER_STATUS.md.
 */
export const getSecrets = query({
	args: {},
	handler: async (ctx) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		const row = await ctx.db
			.query("notificationSettings")
			.withIndex("by_org", (q) => q.eq("organizationId", member.organizationId))
			.first();
		if (!row) return null;
		return row; // includes encrypted twilioAuthToken
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
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		const encToken = args.twilioAuthToken
			? await encrypt(args.twilioAuthToken)
			: undefined;
		return await ctx.runMutation(
			internalUpsert as unknown as FunctionReference<"mutation", "public" | "internal">,
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
		if (args.twilioMessagingServiceSid !== undefined)
			patch.twilioMessagingServiceSid = args.twilioMessagingServiceSid;
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

		if (existing) {
			await ctx.db.patch(existing._id, patch);
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
			newValues: { twilioEnabled: args.twilioEnabled ?? false },
		});
		return id;
	},
});

export const remove = mutation({
	args: {},
	handler: async (ctx) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
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
			oldValues: {},
			newValues: {},
		});
		return existing._id;
	},
});
