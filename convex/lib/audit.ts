// Shared audit logging helper.
//
// Every mutation that writes to the database should log an audit row
// with the diff. This helper eliminates the repeated
// ctx.db.insert("auditLogs", { ... }) boilerplate across 17 files.

import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

type Ctx = GenericMutationCtx<DataModel>;

interface AuditLogEntry {
	organizationId: string;
	userId: string;
	/** e.g. "customer.created", "booking.cancelled", "tour.updated" */
	action: string;
	/** e.g. "customer", "booking", "tour" */
	resourceType: string;
	resourceId: string;
	oldValues: Record<string, unknown>;
	newValues: Record<string, unknown>;
	/**
	 * The caller's address, when the path that ran this mutation was
	 * able to see it. A Convex mutation cannot read the originating
	 * request, so the HTTP edges capture the identity and thread it
	 * down through the args (see convex/lib/requestIdentity.ts).
	 * Undefined for client-initiated (dashboard) mutations.
	 */
	ipAddress?: string;
	/**
	 * The caller's user agent. Same availability as `ipAddress`.
	 */
	userAgent?: string;
}

/**
 * Insert an audit log row. Call this after every significant mutation
 * so the audit trail is always up to date.
 *
 * `ipAddress` / `userAgent` attribute the row to a caller. They stay
 * undefined when the mutation ran without a readable request — a
 * Convex mutation cannot see the request that triggered it, so only
 * the paths that capture the identity at the HTTP edge can supply it
 * (convex/lib/requestIdentity.ts).
 *
 * @example
 *   await logAudit(ctx, {
 *     organizationId: member.organizationId,
 *     userId: member.userId,
 *     action: "customer.created",
 *     resourceType: "customer",
 *     resourceId: customerId,
 *     oldValues: {},
 *     newValues: { email: args.email, name: args.name },
 *   });
 */
export async function logAudit(
	ctx: Ctx,
	entry: AuditLogEntry,
): Promise<void> {
	await ctx.db.insert("auditLogs", {
		organizationId: entry.organizationId,
		userId: entry.userId,
		action: entry.action,
		resourceType: entry.resourceType,
		resourceId: entry.resourceId,
		oldValues: entry.oldValues,
		newValues: entry.newValues,
		ipAddress: entry.ipAddress,
		userAgent: entry.userAgent,
		timestamp: Date.now(),
	});
}
