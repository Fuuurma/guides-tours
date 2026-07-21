/**
 * Better Auth user contact helpers (phone/email for SMS & digests).
 */

import { components } from "../_generated/api";

export type UserContact = {
	userId: string;
	name: string;
	email: string;
	phone: string;
};

type RunQueryCtx = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	runQuery: (ref: any, args: any) => Promise<any>;
};

/** Load name/email/phone for a Better Auth user id. */
export async function loadUserContact(
	ctx: RunQueryCtx,
	userId: string,
): Promise<UserContact | null> {
	const user = (await ctx.runQuery(
		components.betterAuth.adapter.findOne as never,
		{
			model: "user" as never,
			where: [{ field: "id", value: userId }] as never,
		},
	)) as {
		name?: string | null;
		email?: string | null;
		phone?: string | null;
	} | null;
	if (!user) return null;
	const email = (user.email ?? "").trim();
	const phone = (user.phone ?? "").trim();
	return {
		userId,
		name: user.name?.trim() || email || userId,
		email,
		phone,
	};
}

export type MissingStaffPhone = {
	userId: string;
	name: string;
	email: string;
	roles: Array<"guide" | "driver">;
	driverId?: string;
	assignmentCount: number;
};

/**
 * People on upcoming assignments who have no phone on file.
 * Pure helper for the staffing strip + digest.
 */
export function buildMissingStaffPhones(input: {
	guideCounts: Map<string, number>;
	/** driver table id → { userId, count } */
	drivers: Map<string, { userId: string; count: number }>;
	contacts: Map<string, { name: string; email: string; phone: string }>;
}): MissingStaffPhone[] {
	const byUser = new Map<
		string,
		{
			roles: Set<"guide" | "driver">;
			driverId?: string;
			assignmentCount: number;
		}
	>();

	for (const [userId, count] of input.guideCounts) {
		const row = byUser.get(userId) ?? {
			roles: new Set<"guide" | "driver">(),
			assignmentCount: 0,
		};
		row.roles.add("guide");
		row.assignmentCount += count;
		byUser.set(userId, row);
	}

	for (const [driverId, { userId, count }] of input.drivers) {
		const row = byUser.get(userId) ?? {
			roles: new Set<"guide" | "driver">(),
			assignmentCount: 0,
		};
		row.roles.add("driver");
		row.driverId = driverId;
		row.assignmentCount += count;
		byUser.set(userId, row);
	}

	const out: MissingStaffPhone[] = [];
	for (const [userId, row] of byUser) {
		const contact = input.contacts.get(userId);
		if (!contact) continue;
		if (contact.phone.trim()) continue;
		out.push({
			userId,
			name: contact.name,
			email: contact.email,
			roles: [...row.roles].sort(),
			driverId: row.driverId,
			assignmentCount: row.assignmentCount,
		});
	}

	out.sort((a, b) => {
		const byCount = b.assignmentCount - a.assignmentCount;
		if (byCount !== 0) return byCount;
		return a.name.localeCompare(b.name);
	});
	return out;
}
