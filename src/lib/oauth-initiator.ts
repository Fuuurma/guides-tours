/**
 * Browser binding for the cross-domain OAuth one-time token.
 *
 * Why (F-new-oauth-ott-browser-binding-2026-10-03): the crossDomain
 * plugin finishes Google sign-in by minting a random one-time token and
 * redirecting to `<callbackURL>?ott=<token>`; the token is exchanged for
 * the session cookie by whichever browser posts it within three minutes.
 * Two consumers do that exchange — `ConvexBetterAuthProvider` reads `ott`
 * off ANY route at mount (the no-invite flow lands on /dashboard), and
 * the /auth/callback loader (the invite flow). Neither checks that the
 * browser finishing the flow is the one that started it, so the callback
 * URL was a bearer link: an attacker completing Google sign-in to their
 * own account could hand the URL to a victim, who would be logged into
 * the attacker's account (login CSRF / account confusion).
 *
 * Binding: the browser that starts OAuth arms a random nonce in its own
 * storage and carries it in the callback URL as `init` (the plugin keeps
 * the callback query intact when it appends `ott`). Before the router
 * parses the URL — ahead of both consumers — `guardOneTimeTokenInUrl`
 * compares the URL's `init` with the stored nonce. A mismatch (missing,
 * wrong, or already consumed) strips `ott` from the URL so no consumer
 * ever sees the token, and records a refusal the sign-in page explains.
 * The nonce is consumed either way, so a callback URL exchanges at most
 * once, in the browser that armed it.
 *
 * Everything takes its storage / URL / history as parameters so the
 * cases are unit-testable; the `*FromWindow` wrappers bind the browser.
 */

export const OAUTH_INITIATOR_KEY = "gt.oauth.initiator";
export const OAUTH_REFUSED_KEY = "gt.oauth.refused";
export const INIT_PARAM = "init";
export const OTT_PARAM = "ott";

export type GuardVerdict = "none" | "allowed" | "refused";

/** Arm this browser as the initiator of an OAuth flow; returns the nonce. */
export function armOAuthInitiator(storage: Storage): string {
	const nonce = crypto.randomUUID();
	storage.setItem(OAUTH_INITIATOR_KEY, nonce);
	return nonce;
}

/** The callback URL with the initiator nonce attached (query preserved). */
export function withInitiator(callbackURL: string, nonce: string): string {
	const url = new URL(callbackURL);
	url.searchParams.set(INIT_PARAM, nonce);
	return url.toString();
}

/**
 * Inspect a landing URL for a one-time token and decide whether this
 * browser may exchange it. Mutates `url` in place (strips `init` always,
 * strips `ott` on refusal) and calls `replace` when anything changed so
 * the address bar and the router see the cleaned URL.
 */
export function guardOneTimeTokenInUrl(opts: {
	url: URL;
	storage: Storage;
	refusals: Storage;
	replace: (url: URL) => void;
}): GuardVerdict {
	const { url, storage, refusals, replace } = opts;
	if (!url.searchParams.has(OTT_PARAM)) return "none";

	const presented = url.searchParams.get(INIT_PARAM);
	const held = storage.getItem(OAUTH_INITIATOR_KEY);
	storage.removeItem(OAUTH_INITIATOR_KEY);
	url.searchParams.delete(INIT_PARAM);

	if (presented && held && presented === held) {
		replace(url);
		return "allowed";
	}

	url.searchParams.delete(OTT_PARAM);
	refusals.setItem(OAUTH_REFUSED_KEY, "1");
	replace(url);
	return "refused";
}

/** Read and clear the refusal flag (the sign-in page explains it once). */
export function takeOAuthRefusal(refusals: Storage): boolean {
	const refused = refusals.getItem(OAUTH_REFUSED_KEY) === "1";
	refusals.removeItem(OAUTH_REFUSED_KEY);
	return refused;
}

export const OAUTH_REFUSED_MESSAGE =
	"That sign-in link was started in a different browser, so it was not used. Start sign-in again here.";

// ---- browser bindings -------------------------------------------------

export function armOAuthInitiatorFromWindow(): string {
	return armOAuthInitiator(window.localStorage);
}

export function guardOneTimeTokenInWindow(): GuardVerdict {
	if (typeof window === "undefined" || !window.location?.href) return "none";
	return guardOneTimeTokenInUrl({
		url: new URL(window.location.href),
		storage: window.localStorage,
		refusals: window.sessionStorage,
		replace: (url) => window.history.replaceState({}, "", url),
	});
}

export function takeOAuthRefusalFromWindow(): boolean {
	if (typeof window === "undefined") return false;
	return takeOAuthRefusal(window.sessionStorage);
}
