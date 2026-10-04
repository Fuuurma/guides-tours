const STORAGE_KEY = "guides-tours:oauth-browser-binding:v1";
const BINDING_PARAM = "oauthBinding";

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return window
		.btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

async function challengeFor(verifier: string): Promise<string> {
	const digest = await window.crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(verifier),
	);
	return base64Url(new Uint8Array(digest));
}

function newVerifier(): string {
	const bytes = new Uint8Array(32);
	window.crypto.getRandomValues(bytes);
	return base64Url(bytes);
}

/** Build a first-party callback URL and keep its one-time verifier in this tab. */
export async function createOAuthCallbackURL(
	callbackURL: string,
): Promise<string> {
	const origin = window.location.origin;
	const destination = new URL(callbackURL, origin);
	if (destination.origin !== origin) {
		throw new Error("Google sign-in callback must stay on this site");
	}

	const callback =
		destination.pathname === "/auth/callback"
			? destination
			: new URL("/auth/callback", origin);
	if (destination.pathname !== "/auth/callback") {
		callback.searchParams.set(
			"redirect",
			`${destination.pathname}${destination.search}${destination.hash}`,
		);
	}
	callback.searchParams.delete("ott");

	const verifier = newVerifier();
	const challenge = await challengeFor(verifier);
	window.sessionStorage.setItem(STORAGE_KEY, verifier);
	callback.searchParams.set(BINDING_PARAM, challenge);
	return callback.toString();
}

/** Consume the initiating tab's verifier before performing the one-time exchange. */
export async function exchangeBoundOAuthOneTimeToken<T>(
	token: string | undefined,
	binding: string | undefined,
	exchange: (token: string) => Promise<T>,
): Promise<{ accepted: false } | { accepted: true; result: T }> {
	if (!token || !binding || !/^[A-Za-z0-9_-]{43}$/.test(binding)) {
		return { accepted: false };
	}

	let verifier: string | null;
	try {
		verifier = window.sessionStorage.getItem(STORAGE_KEY);
	} catch {
		return { accepted: false };
	}
	if (!verifier) return { accepted: false };

	let matches = false;
	try {
		matches = (await challengeFor(verifier)) === binding;
	} catch {
		// Missing Web Crypto support must fail closed.
	}
	try {
		window.sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		return { accepted: false };
	}
	if (!matches) return { accepted: false };

	return { accepted: true, result: await exchange(token) };
}

export function clearOAuthBrowserBinding(): void {
	try {
		window.sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		// Storage may be unavailable; the sign-in attempt will fail closed later.
	}
}
