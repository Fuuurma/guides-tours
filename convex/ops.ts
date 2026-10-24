// Operator ops: publish a departure and assign crew in one mutation.
//
// Schedules (when the tour runs) and assignments (who runs it) are
// separate tables, but operators staff a slot as one motion. This
// mutation creates or reuses the schedule, then optionally assigns
// a guide/vehicle/driver against it.

import { ConvexError, v } from "convex/values";

import { internalMutation, mutation } from "./_generated/server";
import { internalRefs } from "./lib/internalRefs";
import type { Id } from "./_generated/dataModel";
import { requireRole } from "./lib/authz";
import { assertGuideAssignable } from "./lib/assignmentsShared";

const staffDepartureArgs = {
	tourId: v.id("tours"),
	date: v.string(),
	startTime: v.string(),
	endTime: v.optional(v.string()),
	capacityTotal: v.optional(v.number()),
	notes: v.optional(v.string()),
	publish: v.boolean(),
	guideId: v.optional(v.string()),
	vehicleId: v.optional(v.id("vehicles")),
	driverId: v.optional(v.id("drivers")),
	scheduleId: v.optional(v.id("tourSchedules")),
};

const staffDepartureReturns = v.object({
	scheduleId: v.union(v.id("tourSchedules"), v.null()),
	assignmentId: v.union(v.id("assignments"), v.null()),
});

export const staffDeparture = mutation({
	args: staffDepartureArgs,
	returns: staffDepartureReturns,
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		if (args.guideId) {
			await assertGuideAssignable(ctx, member.organizationId, args.guideId);
		}
		const result: {
			scheduleId: Id<"tourSchedules"> | null;
			assignmentId: Id<"assignments"> | null;
		} = await ctx.runMutation(internalRefs.ops.internalStaffDeparture, {
			organizationId: member.organizationId,
			userId: member.userId,
			...args,
		});
		return result;
	},
});

export const internalStaffDeparture = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		...staffDepartureArgs,
	},
	returns: staffDepartureReturns,
	handler: async (ctx, args) => {
		if (!args.publish && !args.guideId) {
			throw new ConvexError(
				"Nothing to create: publish a departure or assign a guide",
			);
		}

		let scheduleId: Id<"tourSchedules"> | null = args.scheduleId ?? null;

		if (scheduleId) {
			const linked = await ctx.db.get(scheduleId);
			if (!linked) throw new ConvexError("Schedule not found");
			if (linked.organizationId !== args.organizationId) {
				throw new ConvexError(
					"Forbidden: schedule belongs to a different organization",
				);
			}
			if (linked.status === "cancelled") {
				throw new ConvexError("Cannot assign a guide to a cancelled schedule");
			}
		} else {
			// Use .take() + JS filter instead of .unique() to avoid
			// crashing when a cancel/re-create cycle produces two
			// schedules for the same (tourId, date, startTime).
			// F876: drain the partition page by page instead of sampling a
			// .take(20) head — after 21+ cycles the head is all cancelled
			// debris, the find missed the one live schedule, and the
			// mutation published another live dupe.
			let cursor: string | null = null;
			let resolved: Id<"tourSchedules"> | null = null;
			do {
				const page = await ctx.db
					.query("tourSchedules")
					.withIndex("by_tour_date_start", (q) =>
						q
							.eq("tourId", args.tourId)
							.eq("date", args.date)
							.eq("startTime", args.startTime),
					)
					.paginate({ numItems: 100, cursor });
				const existing = page.page.find(
					(s) =>
						s.organizationId === args.organizationId &&
						s.status !== "cancelled",
				);
				if (existing) {
					resolved = existing._id;
				}
				cursor = page.isDone ? null : page.continueCursor;
			} while (cursor !== null && resolved === null);
			if (resolved) {
				scheduleId = resolved;
			}
		}

		if (!scheduleId && args.publish) {
			if (!args.endTime) {
				throw new ConvexError("End time is required to publish a departure");
			}
			if (args.capacityTotal === undefined) {
				throw new ConvexError("Capacity is required to publish a departure");
			}
			const created: Id<"tourSchedules"> = await ctx.runMutation(
				internalRefs.tourSchedules.internalCreate,
				{
					organizationId: args.organizationId,
					userId: args.userId,
					tourId: args.tourId,
					date: args.date,
					startTime: args.startTime,
					endTime: args.endTime,
					capacityTotal: args.capacityTotal,
					notes: args.notes,
				},
			);
			scheduleId = created;
		}

		let assignmentId: Id<"assignments"> | null = null;
		if (args.guideId) {
			const created: Id<"assignments"> = await ctx.runMutation(
				internalRefs.assignments.internalCreate,
				{
					organizationId: args.organizationId,
					userId: args.userId,
					tourId: args.tourId,
					guideId: args.guideId,
					date: args.date,
					startTime: args.startTime,
					vehicleId: args.vehicleId,
					driverId: args.driverId,
					scheduleId: scheduleId ?? undefined,
				},
			);
			assignmentId = created;
		}

		return { scheduleId, assignmentId };
	},
});
