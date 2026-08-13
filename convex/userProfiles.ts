/**
 * Guide / member profile updates (Better Auth user fields).
 */

import { v, ConvexError } from "convex/values";
import {
	mutation,
	query,
	internalQuery,
	type QueryCtx,
} from "./_generated/server";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { authComponent, createAuth } from "./auth";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";
import {
	buildMissingStaffPhones,
	loadUserContact,
	type MissingStaffPhone,
} from "./lib/userContact";

const PHONE_RE = /^\+?[0-9\s().-]{6,20}$/;

/** Shared loader for staffing strip + digest. */
export async function collectMissingStaffPhones(
	ctx: QueryCtx,
	orgId: string,
	dateFrom: string,
	dateTo: string,
): Promise<MissingStaffPhone[]> {
	const MAX = 500;

	const assignments = await ctx.db
		.query("assignments")
		.withIndex("by_org_date", (q) =>
			q
				.eq("organizationId", orgId)
				.gte("date", dateFrom)
				.lte("date", dateTo),
		)
		.take(MAX);

	const guideCounts = new Map<string, number>();
	const driverTableCounts = new Map<string, number>();
	for (const a of assignments) {
		if (a.deletedAt !== undefined || a.status !== "scheduled") continue;
		guideCounts.set(a.guideId, (guideCounts.get(a.guideId) ?? 0) + 1);
		if (a.driverId) {
			const id = String(a.driverId);
			driverTableCounts.set(id, (driverTableCounts.get(id) ?? 0) + 1);
		}
	}

	// Parallelize driver lookups instead of sequential awaits
	// (was N round trips, now 1 batch).
	const driverIds = [...driverTableCounts.keys()];
	const driverDocs = await Promise.all(
		driverIds.map((id) => ctx.db.get(id as Id<"drivers">)),
	);
	const drivers = new Map<string, { userId: string; count: number }>();
	for (let i = 0; i < driverIds.length; i++) {
		const d = driverDocs[i];
		if (!d || d.organizationId !== orgId) continue;
		drivers.set(driverIds[i]!, { userId: d.userId, count: driverTableCounts.get(driverIds[i]!)! });
	}

	const userIds = new Set<string>([
		...guideCounts.keys(),
		...[...drivers.values()].map((d) => d.userId),
	]);
	// Parallelize user contact lookups (was N round trips to
	// Better Auth, now 1 batch).
	const contactResults = await Promise.all(
		[...userIds].map((userId) => loadUserContact(ctx, userId)),
	);
	const contacts = new Map<
		string,
		{ name: string; email: string; phone: string }
	>();
	let idx = 0;
	for (const userId of userIds) {
		const c = contactResults[idx++];
		if (c) {
			contacts.set(userId, {
				name: c.name,
				email: c.email,
				phone: c.phone,
			});
		}
	}

	return buildMissingStaffPhones({ guideCounts, drivers, contacts });
}

async function assertOrgMember(
	ctx: Parameters<typeof requireMembership>[0],
	organizationId: string,
	userId: string,
): Promise<void> {
	const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
	let members: Array<{ userId: string }> = [];
	try {
		const memberList = await auth.api.listMembers({
			headers,
			query: { organizationId },
		});
		members = memberList.members ?? [];
	} catch (err) {
		throw new ConvexError(
			`Failed to verify organization member: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	if (!members.some((m) => m.userId === userId)) {
		throw new ConvexError("User is not a member of this organization");
	}
}

/** Phone (and identity) for a guide/member in the active org. */
export const getContact = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		await assertOrgMember(ctx, member.organizationId, args.userId);

		const user = await loadUserContact(ctx, args.userId);
		return {
			userId: args.userId,
			name: user?.name ?? args.userId,
			email: user?.email ?? "",
			phone: user?.phone ?? "",
		};
	},
});

/**
 * Guides/drivers on scheduled assignments in the range who have no
 * phone — SMS assignment notify won't reach them.
 */
export const missingStaffPhones = query({
	args: {
		dateFrom: v.string(),
		dateTo: v.string(),
	},
	handler: async (ctx, args): Promise<MissingStaffPhone[]> => {
		const member = await requireMembership(ctx);
		return await collectMissingStaffPhones(
			ctx,
			member.organizationId,
			args.dateFrom,
			args.dateTo,
		);
	},
});

export const missingStaffPhonesInternal = internalQuery({
	args: {
		organizationId: v.string(),
		dateFrom: v.string(),
		dateTo: v.string(),
	},
	handler: async (ctx, args): Promise<MissingStaffPhone[]> => {
		return await collectMissingStaffPhones(
			ctx,
			args.organizationId,
			args.dateFrom,
			args.dateTo,
		);
	},
});

/**
 * Update phone for self, or for another member if caller is owner/admin.
 */
export const updatePhone = mutation({
	args: {
		userId: v.optional(v.string()),
		phone: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const targetUserId = args.userId?.trim() || member.userId;
		const isSelf = targetUserId === member.userId;
		if (!isSelf) {
			await requireRole(ctx, ["owner", "admin"]);
		}

		const phone = args.phone.trim();
		if (phone && !PHONE_RE.test(phone)) {
			throw new ConvexError(
				"Please enter a valid phone number (6-20 digits) or leave it empty",
			);
		}

		await assertOrgMember(ctx, member.organizationId, targetUserId);

		await ctx.runMutation(components.betterAuth.adapter.updateOne as never, {
			input: {
				model: "user",
				where: [{ field: "_id", value: targetUserId }],
				update: { phone: phone || null },
			},
		} as never);

		await logAudit(ctx, {
			organizationId: member.organizationId,
			userId: member.userId,
			action: "user.phone_updated",
			resourceType: "user",
			resourceId: targetUserId,
			// PII: don't log phone value — log only that it was updated.
			oldValues: { phoneUpdated: false },
			newValues: { phoneUpdated: true },
		});
		return { userId: targetUserId, phone };
	},
});
