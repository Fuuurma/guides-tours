// Tests for the /auth/callback loader (F704).
//
// A tokenless visit (stripped query, stale link) used to return loader
// data, so the component rendered a "Redirecting..." spinner forever —
// no redirect, no link, dead end. The loader now throws a redirect to
// /sign-in carrying the invite/redirect intent, so the fallback
// component is unreachable on that path.

// @vitest-environment jsdom

import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { Route } from "../routes/auth.callback";

type LoaderDeps = {
	deps: { ott?: string; redirect?: string; invitationId?: string };
};
const loader = Route.options.loader as unknown as (
	opts: LoaderDeps,
) => Promise<unknown>;

describe("auth/callback loader (F704)", () => {
	it("tokenless visit throws a sign-in redirect, not a spinner render", async () => {
		const err = await loader({
			deps: { ott: undefined, redirect: undefined, invitationId: undefined },
		}).then(
			() => null,
			(e: unknown) => e,
		);
		expect(isRedirect(err)).toBe(true);
		expect((err as { options?: { to?: string } }).options?.to).toBe("/sign-in");
	});

	it("forwards redirect and invitationId intent to sign-in", async () => {
		const err = await loader({
			deps: {
				ott: undefined,
				redirect: "/dashboard/tours",
				invitationId: "inv-1",
			},
		}).then(
			() => null,
			(e: unknown) => e,
		);
		expect(isRedirect(err)).toBe(true);
		expect((err as { options?: { search?: unknown } }).options?.search).toEqual(
			{
				redirect: "/dashboard/tours",
				invitationId: "inv-1",
			},
		);
	});
});
