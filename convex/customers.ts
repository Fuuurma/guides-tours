// Customers CRUD + analytics for the CRM.
//
// Source: reservations-automation
//   backend/tours/services/customer_service.py (list_customers_paginated,
//   create_customer, update_customer, delete_customer,
//   get_customer_history_optimized)
//   backend/tours/routers/staff/customers.py (HTTP endpoints)
//
// Core CRUD that the dashboard needs to render. Analytics queries
// (TruncMonth growth, repeat-customer counts, etc.) use the same
// read path.
//
// Audit logging: every mutation writes an `auditLogs` row carrying
// the diff. Mirrors source's `AuditLogger.log_action`.

import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";
import {
	assertValidCustomerInput,
	MAX_NOTES_LEN,
	MAX_PHONE_LEN,
	normalizeEmail,
} from "./lib/validation";

// Whitelisted update fields. Source's ALLOWED_CUSTOMER_UPDATE_FIELDS.
const ALLOWED_UPDATE_FIELDS = new Set([
	"name",
	"phone",
	"preferredLanguage",
	"notes",
	"tags",
	"source",
	"sourceDetails",
	"preferredGuideId",
	"specialRequirements",
	"vipStatus",
	"emailConsent",
	"smsConsent",
]);

// ----- Queries -----

/** List customers for the caller's active organization, paginated. */
export const list = query({
	args: {
		page: v.optional(v.number()),
		pageSize: v.optional(v.number()),
		search: v.optional(v.string()),
		vipOnly: v.optional(v.boolean()),
		source: v.optional(v.string()),
		sortBy: v.optional(
			v.union(
				v.literal("name"),
				v.literal("createdAt"),
				v.literal("totalRevenueCents"),
				v.literal("totalVisits"),
				v.literal("loyaltyPoints"),
			),
		),
		sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const pageSize = Math.min(
			args.pageSize ?? 20,
			100,
		);
		const page = Math.max(1, args.page ?? 1);
		const sortBy = args.sortBy ?? "createdAt";
		const sortOrder = args.sortOrder ?? "desc";
		const order = sortOrder === "asc" ? "asc" : "desc";

		// Pick the most selective index when vipOnly is set — the
		// by_org_vip compound index leads with (org, vipStatus) so the
		// server can skip non-VIP customers entirely instead of
		// fetching every customer and filtering in JS.
		const all = await (args.vipOnly
			? ctx.db
					.query("customers")
					.withIndex("by_org_vip", (q) =>
						q
							.eq("organizationId", member.organizationId)
							.eq("vipStatus", true),
					)
					.collect()
			: ctx.db
					.query("customers")
					.withIndex("by_org", (q) =>
						q.eq("organizationId", member.organizationId),
					)
					.collect());

		let filtered = all;
		if (args.search) {
			const q = args.search.toLowerCase();
			// Email is already stored lowercase (normalized on insert via
			// normalizeEmail), so skip .toLowerCase() on that field to
			// avoid redundant work on every row.
			filtered = filtered.filter(
				(c) =>
					c.name.toLowerCase().includes(q) ||
					c.email.includes(q) ||
					c.phone.toLowerCase().includes(q),
			);
		}
		// vipOnly is handled by the by_org_vip index above.
		if (args.source) {
			filtered = filtered.filter((c) => c.source === args.source);
		}

		filtered.sort((a, b) => {
			const av = a[sortBy];
			const bv = b[sortBy];
			if (typeof av === "number" && typeof bv === "number") {
				return order === "asc" ? av - bv : bv - av;
			}
			const as = String(av ?? "");
			const bs = String(bv ?? "");
			return order === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
		});

		const total = filtered.length;
		const offset = (page - 1) * pageSize;
		const items = filtered.slice(offset, offset + pageSize);
		const hasNext = offset + pageSize < total;

		return {
			items,
			total,
			page,
			pageSize,
			hasNext,
			hasPrevious: page > 1,
		};
	},
});

/** Get a single customer with computed booking counts. */
export const get = query({
	args: { customerId: v.id("customers") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const customer = await ctx.db.get(args.customerId);
		if (!customer) return null;
		if (customer.organizationId !== member.organizationId) return null;

		// Count bookings in bounded scans instead of fetching every
		// booking. For a high-volume customer, .collect() would pull
		// every row just to compute totalBookings + upcomingBookingsCount.
		// We split into two scans: cancelled/old bookings vs upcoming
		// active bookings. The two scans are independent — run in parallel.
		const today = new Date().toISOString().slice(0, 10);
		const MAX_BOOKINGS_TO_COUNT = 1000;
		const [upcomingBookings, sampled] = await Promise.all([
			ctx.db
				.query("bookings")
				.withIndex("by_customer_date", (q) =>
					q
						.eq("customerId", args.customerId)
						.gte("date", today),
				)
				.take(500),
			ctx.db
				.query("bookings")
				.withIndex("by_customer_date", (q) =>
					q.eq("customerId", args.customerId),
				)
				.take(MAX_BOOKINGS_TO_COUNT + 1),
		]);

		const upcomingBookingsCount = upcomingBookings.filter(
			(b) => b.status === "pending" || b.status === "confirmed",
		).length;

		// For totalBookings we need every row, but a customer with
		// thousands of bookings would blow up the response. Cap at
		// 1000 + flag whether there are more. The `sampled` array came
		// from the parallel scan above (same index, same customer).
		const totalBookings =
			sampled.length > MAX_BOOKINGS_TO_COUNT
				? `${MAX_BOOKINGS_TO_COUNT}+`
				: sampled.length;

		return {
			...customer,
			totalBookings,
			upcomingBookingsCount,
		};
	},
});

/** Customer's booking history (sorted desc). */
export const history = query({
	args: {
		customerId: v.id("customers"),
		// Default cap: customers with 100+ bookings would cause the
		// customer detail page to render a very long table. The
		// client can pass a higher limit if it paginates.
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const customer = await ctx.db.get(args.customerId);
		if (!customer || customer.organizationId !== member.organizationId) {
			return [];
		}
		const limit = Math.min(args.limit ?? 100, 500);
		// by_customer_date has date as the second key; .order("desc")
		// returns newest first. take(limit) caps the scan.
		const bookings = await ctx.db
			.query("bookings")
			.withIndex("by_customer_date", (q) =>
				q.eq("customerId", args.customerId),
			)
			.order("desc")
			.take(limit);
		const tourIds = [...new Set(bookings.map((b) => b.tourId))];
		const tours = await Promise.all(tourIds.map((id) => ctx.db.get(id)));
		const tourMap = new Map(
			tours.filter((t): t is NonNullable<typeof t> => t !== null).map(
				(t) => [t._id, t.name],
			),
		);
		return bookings.map((b) => ({
			_id: b._id,
			tourId: b.tourId,
			tourName: tourMap.get(b.tourId) ?? "(deleted tour)",
			date: b.date,
			startTime: b.startTime,
			guests: b.guests,
			status: b.status,
			totalAmountCents: b.totalAmountCents,
			reviewRating: b.reviewRating ?? null,
			createdAt: b.createdAt,
		}));
	},
});

// ----- Mutations -----

/** Create a customer. Requires owner/admin/member. */
export const create = mutation({
	args: {
		name: v.string(),
		email: v.string(),
		phone: v.optional(v.string()),
		notes: v.optional(v.string()),
		preferredLanguage: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
		source: v.optional(v.string()),
		sourceDetails: v.optional(v.string()),
		preferredGuideId: v.optional(v.string()),
		specialRequirements: v.optional(v.string()),
		vipStatus: v.optional(v.boolean()),
		emailConsent: v.optional(v.boolean()),
		smsConsent: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		// Normalize + validate email via shared helper. Same regex +
		// length cap as the public booking flow and the FE validator.
		const email = normalizeEmail(args.email);
		if (!email) {
			throw new ConvexError("Invalid email address");
		}
		// Length-validate the free-text fields. The FE caps these via
		// maxLength on the inputs, but the BE is reachable by any
		// Convex client (mobile app, cron job, future API) — defending
		// in depth here keeps the table clean.
		const validInput = assertValidCustomerInput({
			name: args.name,
			notes: args.notes,
			phone: args.phone,
		});
		// Email uniqueness per org (source: Customer.objects.filter(company=..., email=...).exists())
		const dup = await ctx.db
			.query("customers")
			.withIndex("by_org_email", (q) =>
				q
					.eq("organizationId", member.organizationId)
					.eq("email", email),
			)
			.unique();
		if (dup) {
			throw new ConvexError(
				`Customer with email "${email}" already exists`,
			);
		}

		const now = Date.now();
		const customerId = await ctx.db.insert("customers", {
			organizationId: member.organizationId,
			name: validInput.name,
			email,
			phone: validInput.phone,
			notes: validInput.notes,
			smsConsent: args.smsConsent ?? false,
			emailConsent: args.emailConsent ?? true,
			smsConsentDate: args.smsConsent ? now : undefined,
			emailConsentDate: args.emailConsent !== false ? now : undefined,
			preferredLanguage: args.preferredLanguage ?? "en",
			tags: args.tags ?? [],
			source: args.source ?? "",
			sourceDetails: args.sourceDetails ?? "",
			preferredGuideId: args.preferredGuideId,
			specialRequirements: args.specialRequirements ?? "",
			vipStatus: args.vipStatus ?? false,
			loyaltyPoints: 0,
			totalVisits: 0,
			totalRevenueCents: 0n,
			nextBookingDate: undefined,
			createdAt: now,
			updatedAt: now,
		});

		await logAudit(ctx, {
			organizationId: member.organizationId,
			userId: member.userId,
			action: "customer.created",
			resourceType: "customer",
			resourceId: customerId,
			oldValues: {},
			newValues: {
				email: args.email,
				name: args.name,
				source: args.source ?? "",
			},
		});

		return customerId;
	},
});

/** Update a customer. Only whitelisted fields are persisted. */
export const update = mutation({
	args: {
		customerId: v.id("customers"),
		name: v.optional(v.string()),
		phone: v.optional(v.string()),
		preferredLanguage: v.optional(v.string()),
		notes: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
		source: v.optional(v.string()),
		sourceDetails: v.optional(v.string()),
		preferredGuideId: v.optional(v.string()),
		specialRequirements: v.optional(v.string()),
		vipStatus: v.optional(v.boolean()),
		emailConsent: v.optional(v.boolean()),
		smsConsent: v.optional(v.boolean()),
		email: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		const customer = await ctx.db.get(args.customerId);
		if (!customer) throw new ConvexError("Customer not found");
		if (customer.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}

		const now = Date.now();
		const patch: Record<string, unknown> = {};
		const changes: Record<string, { old: unknown; new: unknown }> = {};

		// Email change requires uniqueness check.
		if (args.email !== undefined) {
			// Normalize via shared helper so "Bob@Example.com" doesn't
			// sneak past the case-sensitive index lookup, and reject
			// invalid shapes / overlong addresses.
			const normalizedEmail = normalizeEmail(args.email);
			if (!normalizedEmail) {
				throw new ConvexError("Invalid email address");
			}
			if (normalizedEmail !== customer.email) {
				const dup = await ctx.db
					.query("customers")
					.withIndex("by_org_email", (q) =>
						q
							.eq("organizationId", member.organizationId)
							.eq("email", normalizedEmail),
					)
					.unique();
				if (dup && dup._id !== args.customerId) {
					throw new ConvexError("Email already in use");
				}
				changes.email = {
					old: customer.email,
					new: normalizedEmail,
				};
				patch.email = normalizedEmail;
			}
		}

		// Length-validate any incoming free-text fields. Same limits
		// as the create mutation and the FE maxLength attributes.
		if (args.name !== undefined) {
			assertValidCustomerInput({ name: args.name });
			if (args.name.trim().length === 0) {
				throw new ConvexError("Name cannot be empty");
			}
		}
		if (args.notes !== undefined && args.notes.length > MAX_NOTES_LEN) {
			throw new ConvexError(
				`Notes are too long (max ${MAX_NOTES_LEN} characters)`,
			);
		}
		if (args.phone !== undefined && args.phone.length > MAX_PHONE_LEN) {
			throw new ConvexError(
				`Phone is too long (max ${MAX_PHONE_LEN} characters)`,
			);
		}

		for (const field of ALLOWED_UPDATE_FIELDS) {
			const incoming = (args as Record<string, unknown>)[field];
			if (incoming === undefined) continue;
			const oldValue = (customer as Record<string, unknown>)[field];
			if (oldValue !== incoming) {
				changes[field] = { old: oldValue, new: incoming };
			}
			patch[field] = incoming;
		}

		// Consent dates follow consent flag.
		if (patch.smsConsent === true) patch.smsConsentDate = now;
		if (patch.smsConsent === false) patch.smsConsentDate = undefined;
		if (patch.emailConsent === true) patch.emailConsentDate = now;
		if (patch.emailConsent === false) patch.emailConsentDate = undefined;

		patch.updatedAt = now;
		await ctx.db.patch(args.customerId, patch);

		if (Object.keys(changes).length > 0) {
			await logAudit(ctx, {
				organizationId: customer.organizationId,
				userId: member.userId,
				action: "customer.updated",
				resourceType: "customer",
				resourceId: args.customerId,
				oldValues: {},
				newValues: { changes },
			});
		}

		return args.customerId;
	},
});

/** Soft-delete (hard in source: Customer.delete). We hard-delete and audit. */
export const remove = mutation({
	args: { customerId: v.id("customers") },
	handler: async (ctx, args) => {
		// Source: @require_staff → any STAFF-role user. Our nearest
		// equivalents are owner/admin/member (the people who do CRM
		// work). Deliberately tighter than source on guides/drivers.
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		const customer = await ctx.db.get(args.customerId);
		if (!customer) throw new ConvexError("Customer not found");
		if (customer.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}

		// Refuse if the customer has any non-cancelled bookings — same
		// behavior source would have via FK CASCADE (lost data) but
		// louder. Cancelled bookings are still kept for history.
		// Bounded scan: a customer with thousands of cancelled
		// bookings would otherwise slow down every delete.
		const bookings = await ctx.db
			.query("bookings")
			.withIndex("by_customer_date", (q) =>
				q.eq("customerId", args.customerId),
			)
			.take(500);
		const live = bookings.filter((b) => b.status !== "cancelled");
		if (live.length > 0) {
			throw new ConvexError(
				`Cannot delete customer with ${live.length} non-cancelled booking(s); cancel them first`,
			);
		}

		await ctx.db.delete(args.customerId);
		await logAudit(ctx, {
			organizationId: customer.organizationId,
			userId: member.userId,
			action: "customer.deleted",
			resourceType: "customer",
			resourceId: args.customerId,
			oldValues: {
				email: customer.email,
				name: customer.name,
			},
			newValues: {},
		});
		return args.customerId;
	},
});

/**
 * NOTE: An earlier `recordCompletion` mutation here was deleted after
 * audit. bookings.ts::complete inlines the
 * customer-stats bump — duplicating it in a separate mutation risked
 * drift. If a future caller needs a manual customer-stats correction
 * (admin tool), land it in convex/admin.ts with proper RBAC.
 */