// Twilio SMS via raw fetch (edge-compatible — no Twilio SDK).

import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
	internalAction,
	internalMutation,
	internalQuery,
} from "./_generated/server";
import { decrypt } from "./lib/crypto";

export type TwilioSendResult = {
	ok: boolean;
	sid?: string;
	status?: string;
	error?: string;
};

type SmsActionCtx = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	runQuery: (ref: any, args: any) => Promise<any>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	runMutation: (ref: any, args: any) => Promise<any>;
};

export const getTwilioConfig = internalQuery({
	args: { organizationId: v.string() },
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("notificationSettings")
			.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
			.first();
		if (!row || !row.twilioEnabled) return null;
		if (!row.twilioAccountSid || !row.twilioAuthToken) return null;
		if (!row.twilioMessagingServiceSid && !row.twilioPhoneNumber) return null;
		return {
			accountSid: row.twilioAccountSid,
			authTokenEncrypted: row.twilioAuthToken,
			phoneNumber: row.twilioPhoneNumber,
			messagingServiceSid: row.twilioMessagingServiceSid,
		};
	},
});

export const recordSmsMessage = internalMutation({
	args: {
		organizationId: v.string(),
		bookingId: v.optional(v.id("bookings")),
		recipientPhone: v.string(),
		recipientName: v.string(),
		messageText: v.string(),
		status: v.string(),
		twilioMessageSid: v.optional(v.string()),
		twilioStatus: v.optional(v.string()),
		errorCode: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert("smsMessages", {
			organizationId: args.organizationId,
			bookingId: args.bookingId,
			recipientPhone: args.recipientPhone,
			recipientName: args.recipientName,
			messageText: args.messageText,
			status: args.status,
			twilioMessageSid: args.twilioMessageSid,
			twilioStatus: args.twilioStatus,
			direction: "outbound",
			costCents: 0n,
			currency: "USD",
			errorCode: args.errorCode,
			errorMessage: args.errorMessage,
			metadata: {},
			sentAt: args.status === "sent" ? now : undefined,
			createdAt: now,
		});
	},
});

/**
 * Send an SMS via Twilio Messages API. Prefer Messaging Service SID
 * when set; otherwise use From phone number.
 */
export async function sendTwilioSms(
	ctx: SmsActionCtx,
	params: {
		organizationId: string;
		to: string;
		body: string;
		recipientName: string;
		bookingId?: string;
	},
): Promise<TwilioSendResult> {
	const config = (await ctx.runQuery(internal.notification_sms.getTwilioConfig, {
		organizationId: params.organizationId,
	})) as {
		accountSid: string;
		authTokenEncrypted: string;
		phoneNumber?: string;
		messagingServiceSid?: string;
	} | null;
	if (!config) {
		return { ok: false, error: "Twilio not configured or disabled" };
	}

	let authToken: string;
	try {
		authToken = await decrypt(config.authTokenEncrypted);
	} catch (err) {
		return {
			ok: false,
			error: `Failed to decrypt Twilio token: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	const form = new URLSearchParams();
	form.set("To", params.to);
	form.set("Body", params.body);
	if (config.messagingServiceSid) {
		form.set("MessagingServiceSid", config.messagingServiceSid);
	} else if (config.phoneNumber) {
		form.set("From", config.phoneNumber);
	} else {
		return { ok: false, error: "No Twilio From number or Messaging Service SID" };
	}

	const auth = btoa(`${config.accountSid}:${authToken}`);
	const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

	let response: Response;
	try {
		response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Basic ${auth}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: form.toString(),
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await ctx.runMutation(internal.notification_sms.recordSmsMessage, {
			organizationId: params.organizationId,
			...(params.bookingId ? { bookingId: params.bookingId } : {}),
			recipientPhone: params.to,
			recipientName: params.recipientName,
			messageText: params.body,
			status: "failed",
			errorMessage: message,
		});
		return { ok: false, error: message };
	}

	const payload = (await response.json().catch(() => ({}))) as {
		sid?: string;
		status?: string;
		code?: number;
		message?: string;
	};

	if (!response.ok) {
		const error = payload.message ?? `Twilio HTTP ${response.status}`;
		await ctx.runMutation(internal.notification_sms.recordSmsMessage, {
			organizationId: params.organizationId,
			...(params.bookingId ? { bookingId: params.bookingId } : {}),
			recipientPhone: params.to,
			recipientName: params.recipientName,
			messageText: params.body,
			status: "failed",
			errorCode: payload.code !== undefined ? String(payload.code) : undefined,
			errorMessage: error,
		});
		return { ok: false, error };
	}

	await ctx.runMutation(internal.notification_sms.recordSmsMessage, {
		organizationId: params.organizationId,
		...(params.bookingId ? { bookingId: params.bookingId } : {}),
		recipientPhone: params.to,
		recipientName: params.recipientName,
		messageText: params.body,
		status: "sent",
		twilioMessageSid: payload.sid,
		twilioStatus: payload.status,
	});

	return { ok: true, sid: payload.sid, status: payload.status };
}

/** Test-only action wrapper so vitest can exercise the fetch path. */
export const sendTwilioSmsAction = internalAction({
	args: {
		organizationId: v.string(),
		to: v.string(),
		body: v.string(),
		recipientName: v.string(),
	},
	handler: async (ctx, args): Promise<TwilioSendResult> => {
		return await sendTwilioSms(ctx, args);
	},
});
