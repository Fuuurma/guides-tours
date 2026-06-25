// AWS Signature V4 signing for SES REST API calls.
//
// Uses Web Crypto API (HMAC-SHA256) so it works in the Convex
// default runtime + Cloudflare Workers + Node 20+ — no
// node:crypto imports needed (and therefore no "use node" directive).

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "ses";

function getCrypto(): Crypto {
	const c = (globalThis as { crypto?: Crypto }).crypto;
	if (!c?.subtle) {
		throw new Error("Web Crypto API unavailable");
	}
	return c;
}

function toHex(bytes: Uint8Array): string {
	let out = "";
	for (let i = 0; i < bytes.length; i++) {
		out += bytes[i]!.toString(16).padStart(2, "0");
	}
	return out;
}

async function hmacSha256(
	key: Uint8Array | ArrayBuffer,
	data: string,
): Promise<Uint8Array> {
	const c = getCrypto();
	const k = await c.subtle.importKey(
		"raw",
		key as BufferSource,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await c.subtle.sign("HMAC", k, new TextEncoder().encode(data));
	return new Uint8Array(sig);
}

async function sha256Hex(data: string): Promise<string> {
	const c = getCrypto();
	const buf = await c.subtle.digest("SHA-256", new TextEncoder().encode(data));
	return toHex(new Uint8Array(buf));
}

function toAmzDate(date: Date): { amzDate: string; dateStamp: string } {
	const pad = (n: number) => n.toString().padStart(2, "0");
	const amzDate =
		`${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
		`T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
	const dateStamp = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
	return { amzDate, dateStamp };
}

export interface SignedRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string;
}

/**
 * Sign an SES REST API request (POST /) using AWS Signature V4.
 *
 * @param params.region     AWS region (e.g. "us-east-1")
 * @param params.accessKey  IAM access key
 * @param params.secretKey  IAM secret key
 * @param params.body       Raw XML/JSON request body
 * @param params.endpoint   Optional override (default: email.{region}.amazonaws.com)
 */
export async function signSesRequest(params: {
	region: string;
	accessKey: string;
	secretKey: string;
	body: string;
	endpoint?: string;
	now?: Date;
}): Promise<SignedRequest> {
	const region = params.region;
	const now = params.now ?? new Date();
	const { amzDate, dateStamp } = toAmzDate(now);
	const host = params.endpoint ?? `email.${region}.amazonaws.com`;
	const service = SERVICE;

	// Step 1: canonical request
	const canonicalHeaders =
		`content-type:application/xml\nhost:${host}\nx-amz-date:${amzDate}\n`;
	const signedHeaders = "content-type;host;x-amz-date";
	const payloadHash = await sha256Hex(params.body);
	const canonicalRequest =
		`POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

	// Step 2: string to sign
	const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
	const stringToSign =
		`${ALGORITHM}\n${amzDate}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

	// Step 3: signing key
	const kSecret = new TextEncoder().encode(`AWS4${params.secretKey}`);
	const kDate = await hmacSha256(kSecret, dateStamp);
	const kRegion = await hmacSha256(kDate, region);
	const kService = await hmacSha256(kRegion, service);
	const kSigning = await hmacSha256(kService, "aws4_request");

	// Step 4: signature
	const signature = await hmacSha256(kSigning, stringToSign);
	const sigHex = toHex(signature);

	// Step 5: authorization header
	const authorization =
		`${ALGORITHM} Credential=${params.accessKey}/${credentialScope}, ` +
		`SignedHeaders=${signedHeaders}, Signature=${sigHex}`;

	return {
		url: `https://${host}/`,
		method: "POST",
		headers: {
			Host: host,
			"Content-Type": "application/xml",
			"X-Amz-Date": amzDate,
			Authorization: authorization,
		},
		body: params.body,
	};
}

/**
 * Build the SES SendEmail XML body.
 */
export function buildSesSendEmailXml(params: {
	from: string;
	to: string;
	subject: string;
	bodyText: string;
	bodyHtml?: string;
}): string {
	const escapeXml = (s: string) =>
		s
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&apos;");

	const parts: string[] = [
		`Subject><Data>${escapeXml(params.subject)}</Data></Subject>`,
		`Body>`,
		`  <Text><Data>${escapeXml(params.bodyText)}</Data></Text>`,
	];
	if (params.bodyHtml) {
		parts.push(
			`  <Html><Data>${escapeXml(params.bodyHtml)}</Data></Html>`,
		);
	}
	parts.push(`</Body>`);

	return (
		`<Action>SendEmail</Action>` +
		`<Message>${parts.join("")}</Message>` +
		`<Source>${escapeXml(params.from)}</Source>` +
		`<Destination><ToAddresses><member>${escapeXml(params.to)}</member></ToAddresses></Destination>`
	);
}
