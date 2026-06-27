// Shared audit logging helper.
//
// Every mutation that writes to the database should log an audit row
// with the diff. This helper eliminates the repeated
// ctx.db.insert("auditLogs", { ... }) boilerplate across 17 files.

import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

type Ctx = GenericMutationCtx<DataModel>;

export interface AuditLogEntry {
	organizationId: string;
	userId: string;
	/** e.g. "customer.created", "booking.cancelled", "tour.updated" */
	action: string;
	/** e.g. "customer", "booking", "tour" */
	resourceType: string;
	resourceId: string;
	oldValues: Record<string, unknown>;
	newValues: Record<string, unknown>;
}

/**
 * Insert an audit log row. Call this after every significant mutation
 * so the audit trail is always up to date.
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
		timestamp: Date.now(),
	});
}
