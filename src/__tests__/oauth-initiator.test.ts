// F-new-oauth-ott-browser-binding-2026-10-03 — the cross-domain OAuth
// one-time token was a bearer link: any browser posting `ott` within
// three minutes got the session, and ConvexBetterAuthProvider exchanges
// any `ott` it finds on any route. The initiating browser now arms a
// nonce carried as `init`; a landing URL whose `init` does not match the
// nonce this browser holds loses its `ott` before any consumer runs.
//
// Every case below is the pure guard with an injected Storage and URL.
// House style: plain chai assertions (no jest-dom matchers in this repo).

import { describe, expect, it } from "vitest";
import {
	armOAuthInitiator,
	guardOneTimeTokenInUrl,
	INIT_PARAM,
	OAUTH_INITIATOR_KEY,
	OAUTH_REFUSED_KEY,
	OTT_PARAM,
	takeOAuthRefusal,
	withInitiator,
} from "../lib/oauth-initiator";

function memoryStorage(): Storage {
	const map = new Map<string, string>();
	return {
		get length() {
			return map.size;
		},
		clear: () => map.clear(),
		getItem: (k) => map.get(k) ?? null,
		key: (i) => [...map.keys()][i] ?? null,
		removeItem: (k) => {
			map.delete(k);
		},
		setItem: (k, v) => {
			map.set(k, String(v));
		},
	};
}

function run(url: string, storage: Storage, refusals = memoryStorage()) {
	const u = new URL(url);
	const replaced: string[] = [];
	const verdict = guardOneTimeTokenInUrl({
		url: u,
		storage,
		refusals,
		replace: (next) => replaced.push(next.toString()),
	});
	return { verdict, url: u, replaced, refusals };
}

describe("oauth initiator — arming and the callback URL", () => {
	it("arms a fresh nonce in the initiator's storage", () => {
		const storage = memoryStorage();
		const nonce = armOAuthInitiator(storage);
		expect(nonce.length).toBeGreaterThan(16);
		expect(storage.getItem(OAUTH_INITIATOR_KEY)).toBe(nonce);
	});

	it("attaches init to the callback URL and keeps the invite query intact", () => {
		const out = new URL(
			withInitiator(
				"https://app.example.com/auth/callback?invitationId=inv-1&redirect=%2Fdashboard%2Ftours",
				"nonce-1",
			),
		);
		expect(out.searchParams.get(INIT_PARAM)).toBe("nonce-1");
		expect(out.searchParams.get("invitationId")).toBe("inv-1");
		expect(out.searchParams.get("redirect")).toBe("/dashboard/tours");
		expect(out.pathname).toBe("/auth/callback");
	});
});

describe("oauth initiator — the one-time-token guard", () => {
	it("leaves a URL without a token alone", () => {
		const storage = memoryStorage();
		const { verdict, url, replaced } = run(
			"https://app.example.com/dashboard?tab=today",
			storage,
		);
		expect(verdict).toBe("none");
		expect(url.searchParams.get("tab")).toBe("today");
		expect(replaced).toEqual([]);
	});

	it("allows the token in the browser that armed the flow and strips only init", () => {
		const storage = memoryStorage();
		const nonce = armOAuthInitiator(storage);
		const { verdict, url, replaced, refusals } = run(
			`https://app.example.com/dashboard?${INIT_PARAM}=${nonce}&${OTT_PARAM}=tok-1`,
			storage,
		);
		expect(verdict).toBe("allowed");
		expect(url.searchParams.get(OTT_PARAM)).toBe("tok-1");
		expect(url.searchParams.has(INIT_PARAM)).toBe(false);
		expect(replaced).toHaveLength(1);
		expect(refusals.getItem(OAUTH_REFUSED_KEY)).toBe(null);
		// The nonce is spent by the exchange.
		expect(storage.getItem(OAUTH_INITIATOR_KEY)).toBe(null);
	});

	it("refuses a copied callback opened in a browser that never armed a flow", () => {
		const storage = memoryStorage();
		const { verdict, url, refusals } = run(
			`https://app.example.com/dashboard?${INIT_PARAM}=attacker-nonce&${OTT_PARAM}=tok-1`,
			storage,
		);
		expect(verdict).toBe("refused");
		expect(url.searchParams.has(OTT_PARAM)).toBe(false);
		expect(url.searchParams.has(INIT_PARAM)).toBe(false);
		expect(url.pathname).toBe("/dashboard");
		expect(refusals.getItem(OAUTH_REFUSED_KEY)).toBe("1");
	});

	it("refuses a token whose init does not match the nonce this browser holds", () => {
		const storage = memoryStorage();
		armOAuthInitiator(storage);
		const { verdict, url } = run(
			`https://app.example.com/auth/callback?invitationId=inv-1&${INIT_PARAM}=someone-elses&${OTT_PARAM}=tok-1`,
			storage,
		);
		expect(verdict).toBe("refused");
		expect(url.searchParams.has(OTT_PARAM)).toBe(false);
		// The rest of the callback intent survives for the sign-in bounce.
		expect(url.searchParams.get("invitationId")).toBe("inv-1");
		// A mismatch still spends the armed nonce.
		expect(storage.getItem(OAUTH_INITIATOR_KEY)).toBe(null);
	});

	it("refuses a token that arrives with no init at all", () => {
		const storage = memoryStorage();
		armOAuthInitiator(storage);
		const { verdict, url } = run(
			`https://app.example.com/dashboard?${OTT_PARAM}=tok-1`,
			storage,
		);
		expect(verdict).toBe("refused");
		expect(url.searchParams.has(OTT_PARAM)).toBe(false);
	});

	it("exchanges a callback URL at most once — a replay is refused", () => {
		const storage = memoryStorage();
		const nonce = armOAuthInitiator(storage);
		const landing = `https://app.example.com/dashboard?${INIT_PARAM}=${nonce}&${OTT_PARAM}=tok-1`;
		expect(run(landing, storage).verdict).toBe("allowed");
		expect(run(landing, storage).verdict).toBe("refused");
	});
});

describe("oauth initiator — the refusal flag", () => {
	it("is read once and cleared", () => {
		const refusals = memoryStorage();
		expect(takeOAuthRefusal(refusals)).toBe(false);
		refusals.setItem(OAUTH_REFUSED_KEY, "1");
		expect(takeOAuthRefusal(refusals)).toBe(true);
		expect(takeOAuthRefusal(refusals)).toBe(false);
	});
});
