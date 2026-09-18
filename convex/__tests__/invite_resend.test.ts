// Real-path invitation tests — no mocks.
//
// These drive the actual Better Auth organization endpoints
// (auth.api.*) against the REAL local betterAuth component registered
// in convex-test, so the adapter's `findPendingInvitation` expiry
// filter and the resend→create fallthrough run for real. The UI tests
// (src/__tests__/pending-invites-section.test.tsx) mock the client and
// cannot catch a broken invite flow — this file can.
//
// What it pins (fleet F128 / brief bbab5684 acceptance #6):
//   - a successful inviteMember call creates a pending invitation row
//   - resend:true on a LIVE invite extends the same row in place
//   - resend:true on an EXPIRED invite falls through to create and
//     leaves a duplicate pending row — the behavior the dashboard's
//     cancel-stale-then-resend flow compensates for
//   - after cancelling the stale row, resend lands on exactly one
//     pending invitation per email
//
// Note: SITE_URL is stubbed to a local URL so isLocalDev() disables
// requireEmailVerification and sign-up issues a session immediately.

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import betterAuthSchema from "../betterAuth/schema";
import { createAuth } from "../auth";
import { components } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");
const betterAuthModules = import.meta.glob("../betterAuth/**/*.{ts,tsx}");

function makeT() {
	const t = convexTest(schema, modules);
	t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
	return t;
}

type InviteRow = {
	_id: string;
	email: string;
	status: string;
	expiresAt: number;
	role?: string | null;
};

async function listInvites(t: any, orgId: string): Promise<InviteRow[]> {
	return await t.run(async (ctx: any) => {
		const res = await ctx.runQuery(components.betterAuth.adapter.findMany, {
			model: "invitation",
			where: [{ field: "organizationId", value: orgId }],
			paginationOpts: { numItems: 100, cursor: null },
		});
		return res.page ?? res;
	});
}

// Push an invitation's expiresAt into the past via the real component
// adapter — `id` isn't a column; the document id is `_id`.
async function expireInvite(t: any, inviteId: string) {
	await t.run(async (ctx: any) => {
		await ctx.runMutation(components.betterAuth.adapter.updateOne, {
			input: {
				model: "invitation",
				where: [{ field: "_id", value: inviteId }],
				update: { expiresAt: Date.now() - 60_000 },
			},
		});
	});
}

// Signs up an owner and creates an org; returns the session headers +
// org id for subsequent authed calls.
async function seedOrg(t: ReturnType<typeof convexTest>) {
	const signUp = await t.run(async (ctx) => {
		const auth = createAuth(ctx);
		const r = await auth.api.signUpEmail({
			body: {
				email: "owner@example.com",
				password: "password1234",
				name: "Owner",
			},
			asResponse: true,
		});
		return { status: r.status, setCookie: r.headers.get("set-cookie") };
	});
	const token = signUp.setCookie?.match(/better-auth\.session_token=([^;]+)/)?.[1];
	if (!token) throw new Error(`sign-up issued no session cookie (status ${signUp.status})`);
	const headers = new Headers({
		cookie: `better-auth.session_token=${token}`,
	});
	const org = await t.run(async (ctx) => {
		const auth = createAuth(ctx);
		const r = await auth.api.createOrganization({
			body: { name: "Acme Tours", slug: "acme" },
			headers,
		});
		return JSON.parse(JSON.stringify(r)) as { id: string };
	});
	return { headers, orgId: org.id };
}

async function invite(
	t: ReturnType<typeof convexTest>,
	headers: Headers,
	orgId: string,
	email: string,
	resend = false,
) {
	return await t.run(async (ctx) => {
		const auth = createAuth(ctx);
		const r = await auth.api.createInvitation({
			body: {
				organizationId: orgId,
				email,
				role: "guide",
				resend,
			},
			headers,
		});
		return JSON.parse(JSON.stringify(r)) as { id: string; status: string };
	});
}

describe("organization invitations — real better-auth path", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("a successful invite creates a pending row (acceptance #6)", async () => {
		vi.stubEnv("SITE_URL", "http://127.0.0.1:3020");
		const t = makeT();
		const { headers, orgId } = await seedOrg(t);

		const created = await invite(t, headers, orgId, "guide@example.com");
		expect(created.status).toBe("pending");
		expect(created.id).toBeTruthy();

		const rows = await listInvites(t, orgId);
		expect(rows.length).toBe(1);
		expect(rows[0]?.status).toBe("pending");
	});

	it("resend on a live invite extends the same row in place", async () => {
		vi.stubEnv("SITE_URL", "http://127.0.0.1:3020");
		const t = makeT();
		const { headers, orgId } = await seedOrg(t);

		const first = await invite(t, headers, orgId, "guide@example.com");
		const resent = await invite(t, headers, orgId, "guide@example.com", true);

		// Same invitation id — the pending row's expiresAt was refreshed,
		// not duplicated.
		expect(resent.id).toBe(first.id);
		const rows = await listInvites(t, orgId);
		expect(rows.length).toBe(1);
	});

	it("resend on an expired invite falls through to create — and the UI compensation restores one row", async () => {
		vi.stubEnv("SITE_URL", "http://127.0.0.1:3020");
		const t = makeT();
		const { headers, orgId } = await seedOrg(t);

		const first = await invite(t, headers, orgId, "stale@example.com");
		await expireInvite(t, first.id);

		// Better Auth's findPendingInvitation filters expired rows, so
		// resend can't match the stale one — it creates a second pending
		// row for the same email. This is the duplicate the dashboard's
		// cancel-stale-first step exists to prevent.
		const dup = await invite(t, headers, orgId, "stale@example.com", true);
		expect(dup.id).not.toBe(first.id);
		expect((await listInvites(t, orgId)).length).toBe(2);

		// The UI plan: cancel every expired same-email row, then resend.
		await t.run(async (ctx) => {
			const auth = createAuth(ctx);
			await auth.api.cancelInvitation({
				body: { invitationId: first.id },
				headers,
			});
		});
		await invite(t, headers, orgId, "stale@example.com", true);

		const rows = await listInvites(t, orgId);
		const pending = rows.filter((r) => r.status === "pending");
		expect(pending.length).toBe(1);
		expect(pending[0]?._id).toBe(dup.id);
	});
});
