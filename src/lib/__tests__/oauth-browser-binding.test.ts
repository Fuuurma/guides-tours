// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createOAuthCallbackURL,
	exchangeBoundOAuthOneTimeToken,
} from "@/lib/oauth-browser-binding";

describe("OAuth callback browser binding", () => {
	beforeEach(() => {
		sessionStorage.clear();
		Object.defineProperty(window, "crypto", {
			configurable: true,
			value: webcrypto,
		});
	});

	it("keeps the verifier in this tab and exchanges once for its callback", async () => {
		const callback = new URL(
			await createOAuthCallbackURL("/onboarding?from=invite"),
		);
		const binding = callback.searchParams.get("oauthBinding");
		expect(callback.pathname).toBe("/auth/callback");
		expect(callback.searchParams.get("redirect")).toBe(
			"/onboarding?from=invite",
		);
		expect(binding).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(sessionStorage.length).toBe(1);
		const verifier = sessionStorage.getItem(sessionStorage.key(0) ?? "");
		if (!verifier) throw new Error("OAuth verifier was not stored");
		expect(callback.href).not.toContain(verifier);

		const exchanges: string[] = [];
		const exchange = async (token: string) => {
			exchanges.push(token);
			return { session: "created" };
		};
		const first = await exchangeBoundOAuthOneTimeToken(
			"ott-1",
			binding ?? undefined,
			exchange,
		);
		const replay = await exchangeBoundOAuthOneTimeToken(
			"ott-1",
			binding ?? undefined,
			exchange,
		);

		expect(first).toEqual({ accepted: true, result: { session: "created" } });
		expect(replay).toEqual({ accepted: false });
		expect(exchanges).toEqual(["ott-1"]);
	});

	it("does not exchange a copied callback in a fresh browser context", async () => {
		const callback = new URL(await createOAuthCallbackURL("/dashboard"));
		const binding = callback.searchParams.get("oauthBinding") ?? undefined;
		sessionStorage.clear();
		let exchanges = 0;

		const result = await exchangeBoundOAuthOneTimeToken(
			"copied-ott",
			binding,
			async () => {
				exchanges += 1;
			},
		);

		expect(result).toEqual({ accepted: false });
		expect(exchanges).toBe(0);
	});

	it("rejects a binding from another sign-in attempt before exchange", async () => {
		await createOAuthCallbackURL("/dashboard");
		let exchanges = 0;

		const result = await exchangeBoundOAuthOneTimeToken(
			"ott-2",
			"A".repeat(43),
			async () => {
				exchanges += 1;
			},
		);

		expect(result).toEqual({ accepted: false });
		expect(exchanges).toBe(0);
	});
});
