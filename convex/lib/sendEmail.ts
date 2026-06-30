// Shared SES email sender for guides-tours.
//
// All outbound email goes through here so the dispatch + invite flows share
// one implementation (env handling, error returns, SigV4 signing). Uses the
// hand-rolled Web Crypto SigV4 helper at convex/lib/awsSigV4.ts — see
// docs/EDGE-RUNTIME.md for why this repo doesn't use @aws-sdk/client-sesv2.
//
// Behavior:
//   - If any of AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
//     SES_FROM_ADDRESS is unset, the call is logged and returns
//     { status: "skipped" } (so dev still works without SES).
//   - On transport or SES-side failure, returns { status: "failed", error }
//     — callers decide whether that's fatal for their flow.
//   - Never throws. Email is a side-channel; nothing in the app should
//     depend on it for correctness.

import {
	buildSesSendEmailXml,
	signSesRequest,
} from "./awsSigV4";

export type SendEmailResult =
	| { status: "sent" }
	| { status: "skipped"; reason: string }
	| { status: "failed"; error: string };

export type SendEmailParams = {
	to: string;
	subject: string;
	bodyText: string;
	bodyHtml?: string;
	// Optional override — defaults to SES_FROM_ADDRESS. Useful for
	// per-org branded from-addresses once that feature lands.
	from?: string;
};

export async function sendTemplatedEmail(
	params: SendEmailParams,
): Promise<SendEmailResult> {
	const region = process.env.AWS_REGION;
	const accessKey = process.env.AWS_ACCESS_KEY_ID;
	const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
	const from = params.from ?? process.env.SES_FROM_ADDRESS;

	if (!region || !accessKey || !secretKey || !from) {
		const missing = [
			!region && "AWS_REGION",
			!accessKey && "AWS_ACCESS_KEY_ID",
			!secretKey && "AWS_SECRET_ACCESS_KEY",
			!from && "SES_FROM_ADDRESS",
		]
			.filter(Boolean)
			.join(", ");
		console.warn(
			`[sendEmail] SES not configured (missing: ${missing}) — skipping email to ${params.to}`,
		);
		return { status: "skipped", reason: `SES not configured: ${missing}` };
	}

	const xmlBody = buildSesSendEmailXml({
		from,
		to: params.to,
		subject: params.subject,
		bodyText: params.bodyText,
		bodyHtml: params.bodyHtml,
	});

	const signed = await signSesRequest({
		region,
		accessKey,
		secretKey,
		body: xmlBody,
	});

	let resp: Response;
	try {
		resp = await fetch(signed.url, {
			method: signed.method,
			headers: signed.headers,
			body: signed.body,
		});
	} catch (e) {
		return {
			status: "failed",
			error: `fetch error: ${(e as Error).message}`,
		};
	}

	if (!resp.ok) {
		const errText = await resp.text();
		return {
			status: "failed",
			error: `SES ${resp.status}: ${errText.slice(0, 500)}`,
		};
	}

	return { status: "sent" };
}
