process.env.ENCRYPTION_KEY ??= "a".repeat(64);

import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import schema from "../schema";
import betterAuthSchema from "../betterAuth/schema";
import { components } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");
const betterAuthModules = import.meta.glob("../betterAuth/**/*.{ts,tsx}");

function makeT() {
	const t = convexTest(schema, modules);
	t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
	return t;
}

describe("probe adapter.create validator", () => {
	it("accepts exact invitation fields", async () => {
		vi.stubEnv("SITE_URL", "http://127.0.0.1:3020");
		const t = makeT();
		const id = await t.run(async (ctx) => {
			return await ctx.runMutation(components.betterAuth.adapter.create, {
				input: {
					model: "invitation",
					data: {
						organizationId: "org1",
						email: "a@b.c",
						role: "guide",
						status: "pending",
						expiresAt: Date.now(),
						createdAt: Date.now(),
						inviterId: "u1",
					},
				},
			});
		});
		console.log("created:", JSON.stringify(id));
	});

	it("rejects extra _id in data", async () => {
		vi.stubEnv("SITE_URL", "http://127.0.0.1:3020");
		const t = makeT();
		let err: unknown = null;
		try {
			await t.run(async (ctx) => {
				return await ctx.runMutation(components.betterAuth.adapter.create, {
					input: {
						model: "invitation",
						data: {
							_id: "abcdef",
							organizationId: "org1",
							email: "a@b.c",
							role: "guide",
							status: "pending",
							expiresAt: Date.now(),
							createdAt: Date.now(),
							inviterId: "u1",
						},
					},
				});
			});
		} catch (e) {
			err = e;
		}
		console.log("with _id err:", (err as Error)?.message?.slice(0, 300));
	});
});
