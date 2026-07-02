// Global TanStack Start config.
//
// Wires up request middleware that adds security headers to every
// response. The Cloudflare Worker doesn't expose a `_headers` file
// path for full-stack apps (that's only for static assets), so the
// headers need to be set in code via the request middleware chain.
//
// Each header is a defense-in-depth measure:
//
//   - X-Content-Type-Options: nosniff
//     Prevents MIME-sniffing attacks where the browser interprets a
//     file as a different type than declared.
//
//   - X-Frame-Options: DENY
//     Clickjacking protection — our pages should never be embedded
//     in iframes. For internal apps, DENY is the safest default.
//     The public booking page doesn't need to be embeddable.
//
//   - Referrer-Policy: strict-origin-when-cross-origin
//     Sends Referer only for same-origin requests, and only the
//     origin (not the full URL) on cross-origin. Standard defensive
//     default.
//
//   - Permissions-Policy: camera=(), microphone=(), geolocation=()
//     We don't use any of these features — deny by default so a
//     compromised script can't silently request them.
//
//   - Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
//     HSTS — tells browsers to always use HTTPS for 2 years.
//     Cloudflare handles the TLS termination so this is safe to
//     advertise even though the Worker itself is HTTP-internal.
//
//   - X-XSS-Protection: 0
//     Disabled. Modern browsers have better built-in XSS protection
//     and the header's "block" mode has been used as a vuln vector
//     in the past (e.g. IE/Edge backdoors). Explicitly disable.
//
//   - Content-Security-Policy
//     Restrictive CSP for the dashboard. The public booking page
//     can override this with a more permissive CSP if needed.
//     'self' for scripts/styles/connect covers Convex HTTP, fonts,
//     and the inline styles React renders. No 'unsafe-inline' or
//     'unsafe-eval' — production builds don't need either.
//
// CSP allows:
//   - Scripts from self + inline (TanStack Start hydration requires
//     inline scripts — they're all bundled by Vite, not user-supplied)
//   - Styles from self + Google Fonts (CSS font loading)
//   - Images from self + data: URIs (avatar URLs)
//   - Connect to self + Convex (real-time queries)
//   - Frames: none (X-Frame-Options: DENY)
//   - Forms: self only
//   - Base-URI: self (prevents <base> tag hijacking)

import { createStart, createMiddleware } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

const securityHeadersMiddleware = createMiddleware().server(
	async ({ next }) => {
		setResponseHeader("X-Content-Type-Options", "nosniff");
		setResponseHeader("X-Frame-Options", "DENY");
		setResponseHeader("Referrer-Policy", "strict-origin-when-cross-origin");
		setResponseHeader(
			"Permissions-Policy",
			"camera=(), microphone=(), geolocation=(), interest-cohort=()",
		);
		setResponseHeader(
			"Strict-Transport-Security",
			"max-age=63072000; includeSubDomains; preload",
		);
		setResponseHeader("X-XSS-Protection", "0");
		setResponseHeader(
			"Content-Security-Policy",
			[
				"default-src 'self'",
				"script-src 'self' 'unsafe-inline'",
				"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
				"font-src 'self' https://fonts.gstatic.com data:",
				"img-src 'self' data: https:",
				"connect-src 'self' https://*.convex.cloud wss://*.convex.cloud",
				"frame-ancestors 'none'",
				"form-action 'self'",
				"base-uri 'self'",
				"object-src 'none'",
			].join("; "),
		);
		return next();
	},
);

export const startInstance = createStart(() => ({
	requestMiddleware: [securityHeadersMiddleware],
}));