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
} from "./_generated/server";
import type { FunctionReference } from "convex/server";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";

// ---- queries ----

export const list = query({
	args: {
		purpose: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		const MAX_FILES = 500;
		let all;
		if (args.purpose) {
			all = await ctx.db
				.query("files")
				.withIndex("by_org_purpose", (q) =>
					q.eq("organizationId", orgId).eq("purpose", args.purpose!),
				)
				.take(MAX_FILES);
		} else {
			all = await ctx.db
				.query("files")
				.withIndex("by_org", (q) => q.eq("organizationId", orgId))
				.take(MAX_FILES);
		}
		const sorted = all.sort((a, b) => b.createdAt - a.createdAt);
		return await Promise.all(
			sorted.map(async (f) => ({
				...f,
				url: await ctx.storage.getUrl(f.storageId),
			})),
		);
	},
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
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
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
			// Use by_tour would require knowing the tourId, but we only
			// have the storageId. Scan by_org and break after match.
			// There should only be one tourImage per storageId.
			const images = await ctx.db
				.query("tourImages")
				.withIndex("by_org", (q) =>
					q.eq("organizationId", args.organizationId),
				)
				.take(500);
			for (const img of images) {
				if (img.storageId === existing.storageId) {
					await ctx.db.delete(img._id);
					break;
				}
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