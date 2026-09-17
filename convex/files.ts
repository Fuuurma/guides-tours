// Files: app-level bookkeeping for uploaded blobs.
//
// Convex storage (_storage) tracks the blob itself + URL. The
// `files` table adds metadata: who uploaded, what it's for, content
// type, size. Used by tourImages (purpose: tour-image) and any other
// upload surface.
//
// Source: backend/tours/models.py::File (with purpose enum).

import { v, ConvexError } from "convex/values";
import {
	query,
	mutation,
	internalMutation,
	internalQuery,
	type QueryCtx,
} from "./_generated/server";

import { internalRefs } from "./lib/internalRefs";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";

// ---- queries ----

const MAX_FILES = 500;

async function listRows(
	ctx: QueryCtx,
	orgId: string,
	args: { purpose?: string },
) {
	// The time-tailed indexes make take() bound the NEWEST files — the
	// old by_org/by_org_purpose scans returned the 500 oldest rows and
	// the JS sort only reordered that stale window (F57).
	const all = args.purpose
		? await ctx.db
				.query("files")
				.withIndex("by_org_purpose_created", (q) =>
					q.eq("organizationId", orgId).eq("purpose", args.purpose!),
				)
				.order("desc")
				.take(MAX_FILES)
		: await ctx.db
				.query("files")
				.withIndex("by_org_created", (q) => q.eq("organizationId", orgId))
				.order("desc")
				.take(MAX_FILES);
	return {
		items: await Promise.all(
			all.map(async (f) => ({
				...f,
				url: await ctx.storage.getUrl(f.storageId),
			})),
		),
		truncated: all.length >= MAX_FILES,
	};
}

export const list = query({
	args: {
		purpose: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		return listRows(ctx, member.organizationId, args);
	},
});

// Internal mirror for tests — takes the org explicitly.
export const listInternal = internalQuery({
	args: {
		organizationId: v.string(),
		purpose: v.optional(v.string()),
	},
	handler: async (ctx, args) => listRows(ctx, args.organizationId, args),
});

export const get = query({
	args: { fileId: v.id("files") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const f = await ctx.db.get(args.fileId);
		if (!f) throw new ConvexError("File not found");
		if (f.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: file belongs to a different organization");
		}
		const url = await ctx.storage.getUrl(f.storageId);
		return { ...f, url };
	},
});

// ---- mutations ----

export const internalTrack = internalMutation({
	args: {
		organizationId: v.string(),
		uploadedBy: v.string(),
		storageId: v.id("_storage"),
		filename: v.string(),
		contentType: v.string(),
		size: v.number(),
		purpose: v.string(),
	},
	handler: async (ctx, args) => {
		if (args.size < 0) throw new ConvexError("size must be non-negative");
		const id = await ctx.db.insert("files", {
			organizationId: args.organizationId,
			storageId: args.storageId,
			filename: args.filename,
			contentType: args.contentType,
			size: args.size,
			purpose: args.purpose,
			uploadedBy: args.uploadedBy,
			createdAt: Date.now(),
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.uploadedBy,
			action: "file.tracked",
			resourceType: "file",
			resourceId: id,
			oldValues: {},
			newValues: {
				filename: args.filename,
				purpose: args.purpose,
				size: args.size,
			},
		});
		return id;
	},
});

export const remove = mutation({
	args: { fileId: v.id("files") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		// A tour-image file deletion also drops the tourImages gallery
		// row (internalRemove below) — that path must honor the
		// owner/admin gate on tourImages.remove, not the looser member
		// gate on plain files (F56).
		const file = await ctx.db.get(args.fileId);
		if (file && file.organizationId === member.organizationId) {
			const allowed =
				file.purpose === "tour-image"
					? ["owner", "admin"]
					: ["owner", "admin", "member"];
			if (!allowed.includes(member.role)) {
				throw new ConvexError(
					`Forbidden: requires one of [${allowed.join(", ")}], have ${member.role}`,
				);
			}
		}
		return await ctx.runMutation(
			internalRefs.files.internalRemove,
			{ organizationId: member.organizationId, userId: member.userId, fileId: args.fileId },
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		fileId: v.id("files"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.fileId);
		if (!existing) throw new ConvexError("File not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.delete(args.fileId);
		// If this blob backed a tour image, remove the gallery row too
		// so the tour UI doesn't keep a broken storage reference.
		if (existing.purpose === "tour-image") {
			// Direct storageId index — the old by_org take(500) scan
			// missed the row past 500 org images and left a dangling
			// gallery reference (F58).
			const img = await ctx.db
				.query("tourImages")
				.withIndex("by_storage_id", (q) =>
					q.eq("storageId", existing.storageId),
				)
				.unique();
			if (img && img.organizationId === args.organizationId) {
				await ctx.db.delete(img._id);
				// Honest audit — the gallery row removal was previously
				// invisible under the file.deleted entry (F56).
				await logAudit(ctx, {
					organizationId: args.organizationId,
					userId: args.userId,
					action: "tourImage.deleted",
					resourceType: "tourImage",
					resourceId: img._id,
					oldValues: { tourId: img.tourId, isPrimary: img.isPrimary },
					newValues: {},
				});
			}
		}
		try {
			await ctx.storage.delete(existing.storageId);
		} catch {
			// ignore — blob may already be gone
		}
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "file.deleted",
			resourceType: "file",
			resourceId: args.fileId,
			// PII: don't log filename (may contain customer name).
			oldValues: {
				purpose: existing.purpose,
				size: existing.size,
			},
			newValues: {},
		});
		return args.fileId;
	},
});

export const generateUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		await requireRole(ctx, ["owner", "admin", "member", "guide"]);
		return await ctx.storage.generateUploadUrl();
	},
});