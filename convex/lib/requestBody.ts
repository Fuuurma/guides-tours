// Bounded reads for HTTP request bodies.
//
// Every unauthenticated HTTP route — the public booking endpoint, the
// OTA webhook routes, the Stripe webhook — reads a body from a caller
// we have not authenticated yet. `await request.text()` buffers the
// whole payload before anything can look at it, so one oversized POST
// costs the process the platform's request ceiling (20 MB on Convex) in
// memory, per request.
//
// These helpers cap the read itself: bytes past the cap are never
// buffered, and the oversized request is rejected before JSON.parse.
//
// Counts are real wire bytes (UTF-8), not UTF-16 string length — the
// same contract the public booking path set with F51. A 4 KB body of
// multibyte characters is 8+ KB on the wire.

export type BodyReadResult =
	| { ok: true; text: string }
	| { ok: false; reason: "too-large" | "read-failed" };

/**
 * Read a request body, refusing to buffer more than `maxBytes`.
 *
 * `request.body` is a stream, so the cap is enforced *during* the
 * read and the tail of an oversized body is never materialised. If the
 * runtime does not expose the body as a stream, the buffered path is
 * used instead: the body is still read, but the same cap rejects it
 * before the caller parses it.
 */
export async function readBodyWithLimit(
	request: Request,
	maxBytes: number,
): Promise<BodyReadResult> {
	const stream = request.body;
	if (stream && typeof stream.getReader === "function") {
		const result = await readStream(stream, maxBytes);
		if (result.kind !== "stream-error") {
			return result.kind === "ok"
				? { ok: true, text: result.text }
				: { ok: false, reason: "too-large" };
		}
		// The stream could not be read (a runtime that exposes a body
		// it cannot stream, a truncated request). Fall through to the
		// buffered path rather than failing the request outright.
	}

	try {
		const bytes = new Uint8Array(await request.arrayBuffer());
		if (bytes.byteLength > maxBytes) {
			return { ok: false, reason: "too-large" };
		}
		return { ok: true, text: decodeUtf8([bytes], bytes.byteLength) };
	} catch {
		return { ok: false, reason: "read-failed" };
	}
}

type StreamReadResult =
	| { kind: "ok"; text: string }
	| { kind: "too-large" }
	| { kind: "stream-error" };

async function readStream(
	stream: ReadableStream<Uint8Array>,
	maxBytes: number,
): Promise<StreamReadResult> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			total += value.byteLength;
			if (total > maxBytes) {
				// Stop here — the rest of the body is never buffered.
				void reader.cancel().catch(() => {});
				return { kind: "too-large" };
			}
			chunks.push(value);
		}
	} catch {
		return { kind: "stream-error" };
	}
	return { kind: "ok", text: decodeUtf8(chunks, total) };
}

function decodeUtf8(chunks: Uint8Array[], total: number): string {
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	// The default TextDecoder drops a leading BOM, like `request.text()`.
	return new TextDecoder("utf-8").decode(bytes);
}
