// F-new-oauth-ott-browser-binding-2026-10-03 — the window binding behind
// getRouter()'s guard. ConvexBetterAuthProvider reads `ott` straight off
// window.location at mount, so the contract that matters is the address
// bar: a token this browser did not initiate must be gone from it before
// the router (and the provider) ever look.
//
// House style: plain chai assertions (no jest-dom matchers in this repo).

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
	armOAuthInitiatorFromWindow,
	guardOneTimeTokenInWindow,
	INIT_PARAM,
	OAUTH_REFUSED_KEY,
	OTT_PARAM,
	takeOAuthRefusalFromWindow,
} from "../lib/oauth-initiator";

function land(path: string) {
	window.history.replaceState({}, "", path);
}

describe("oauth initiator — window binding (the getRouter guard)", () => {
	beforeEach(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
		land("/");
	});

	it("a copied callback opened in a fresh browser loses its token before the router sees it", () => {
		land(`/dashboard?${INIT_PARAM}=attacker-nonce&${OTT_PARAM}=tok-1`);

		expect(guardOneTimeTokenInWindow()).toBe("refused");

		const after = new URL(window.location.href);
		expect(after.pathname).toBe("/dashboard");
		expect(after.searchParams.has(OTT_PARAM)).toBe(false);
		expect(after.searchParams.has(INIT_PARAM)).toBe(false);
		expect(window.sessionStorage.getItem(OAUTH_REFUSED_KEY)).toBe("1");
		// The sign-in page reads the refusal once.
		expect(takeOAuthRefusalFromWindow()).toBe(true);
		expect(takeOAuthRefusalFromWindow()).toBe(false);
	});

	it("the browser that armed the flow keeps its token for the provider to exchange", () => {
		const nonce = armOAuthInitiatorFromWindow();
		land(`/dashboard?${INIT_PARAM}=${nonce}&${OTT_PARAM}=tok-1`);

		expect(guardOneTimeTokenInWindow()).toBe("allowed");

		const after = new URL(window.location.href);
		expect(after.searchParams.get(OTT_PARAM)).toBe("tok-1");
		expect(after.searchParams.has(INIT_PARAM)).toBe(false);
		expect(window.sessionStorage.getItem(OAUTH_REFUSED_KEY)).toBe(null);
	});

	it("a plain visit is untouched", () => {
		land("/sign-in?redirect=%2Fdashboard");
		expect(guardOneTimeTokenInWindow()).toBe("none");
		expect(window.location.search).toBe("?redirect=%2Fdashboard");
	});
});
