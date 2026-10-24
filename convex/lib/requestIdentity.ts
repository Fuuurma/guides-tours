// The caller's identity (address + user agent) of the HTTP request
// that triggered a mutation.
//
// A Convex mutation never sees the request that caused it: the
// dashboard calls Convex straight from the browser, so a
// client-initiated mutation has NO server-visible origin — there is no
// header to read and nothing to attribute. Only the HTTP edges can
// know the caller, so they capture the identity here and thread it
// down through the mutation args into logAudit (convex/lib/audit.ts).
//
// That is why this is a separate module and not a helper inside
// audit.ts: the capture belongs at the HTTP edge, the persistence
// belongs at the mutation.
//
// IP rule (F65): Cloudflare sets CF-Connecting-IP to the address the
// edge observed. X-Forwarded-For may carry a client-supplied prefix,
// so only its LAST element is edge-observed — reading the first lets
// an attacker choose their own bucket.

export interface RequestIdentity {
	/** The edge-observed caller address, or undefined when the request carried none. */
	ipAddress?: string;
	/** The caller's user agent, or undefined when the request carried none. */
	userAgent?: string;
}

/**
 * Extract the caller's address and user agent from a request.
 *
 * The address follows the same rule the public-booking rate limiter
 * uses, so the address recorded on an audit row is the exact address
 * the abuse controls bucketed.
 */
export function extractRequestIdentity(request: Request): RequestIdentity {
	const xff = request.headers.get("x-forwarded-for");
	const ip =
		request.headers.get("cf-connecting-ip") ??
		xff?.split(",").at(-1)?.trim() ??
		"";
	const userAgent = request.headers.get("user-agent");
	return {
		ipAddress: ip || undefined,
		userAgent: userAgent || undefined,
	};
}
