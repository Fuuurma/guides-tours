import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readBodyWithLimit } from "../requestBody";

/**
 * F554: unauthenticated HTTP routes must not buffer an unbounded body.
 *
 * The Stripe webhook, the OTA webhooks and the public booking endpoint
 * all read a caller-supplied body before they can authenticate it.
 * `await request.text()` buffers the whole payload first, so the cap
 * that used to exist was only applied *after* the bytes were already
 * in memory.
 *
 * The unit pins below cover the bounded reader itself; the source pin
 * at the bottom keeps every HTTP route on the bounded path.
 */

const CAP = 2048;

function fakeRequest(partial: Partial<Request>): Request {
	return partial as unknown as Request;
}

function streamOf(text: string): ReadableStream<Uint8Array<ArrayBuffer>> {
	const bytes = new TextEncoder().encode(text);
	return new ReadableStream<Uint8Array<ArrayBuffer>>({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		},
	});
}

describe("readBodyWithLimit", () => {
	it("returns the body text when it is under the cap", async () => {
		const body = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded" });
		const result = await readBodyWithLimit(fakeRequest({ body: streamOf(body) }), CAP);
		expect(result).toEqual({ ok: true, text: body });
	});

	it("keeps multibyte text byte-exact", async () => {
		const body = JSON.stringify({ name: "Guía — 東京 🎫" });
		const result = await readBodyWithLimit(fakeRequest({ body: streamOf(body) }), CAP);
		expect(result).toEqual({ ok: true, text: body });
	});

	it("rejects an oversized body without reading the rest of it", async () => {
		let produced = 0;
		const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
			pull(controller) {
				if (produced >= 64 * 1024) {
					controller.close();
					return;
				}
				const chunk = new Uint8Array(1024);
				produced += chunk.byteLength;
				controller.enqueue(chunk);
			},
		});
		const result = await readBodyWithLimit(fakeRequest({ body: stream }), CAP);
		expect(result).toEqual({ ok: false, reason: "too-large" });
		// The stream carries 64 KB — a bounded read stops at the cap and
		// never buffers the rest. Two chunks of slack cover the stream's
		// one-chunk lookahead.
		expect(produced).toBeLessThanOrEqual(CAP + 2 * 1024);
	});

	it("falls back to the buffered read when the body is not a stream", async () => {
		const body = "hello";
		const bytes = new TextEncoder().encode(body);
		const result = await readBodyWithLimit(
			fakeRequest({
				body: null,
				arrayBuffer: async () => bytes.buffer,
			}),
			CAP,
		);
		expect(result).toEqual({ ok: true, text: body });
	});

	it("rejects an oversized body on the buffered path too", async () => {
		const bytes = new Uint8Array(CAP + 1);
		const result = await readBodyWithLimit(
			fakeRequest({ body: null, arrayBuffer: async () => bytes.buffer }),
			CAP,
		);
		expect(result).toEqual({ ok: false, reason: "too-large" });
	});

	it("reports a read failure instead of throwing", async () => {
		const result = await readBodyWithLimit(
			fakeRequest({
				body: null,
				arrayBuffer: async () => {
					throw new Error("socket closed");
				},
			}),
			CAP,
		);
		expect(result).toEqual({ ok: false, reason: "read-failed" });
	});

	it("falls back to the buffered read when the stream errors", async () => {
		const body = "stream broke";
		const bytes = new TextEncoder().encode(body);
		const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
			pull() {
				throw new Error("stream broke");
			},
		});
		const result = await readBodyWithLimit(
			fakeRequest({
				body: stream,
				arrayBuffer: async () => bytes.buffer,
			}),
			CAP,
		);
		expect(result).toEqual({ ok: true, text: body });
	});
});

const REPO_ROOT = join(__dirname, "..", "..", "..");
const CONVEX_DIR = join(REPO_ROOT, "convex");

/** HTTP routes that read a body from an unauthenticated caller. */
const ROUTES_WITH_BODIES = [
	"convex/http.ts",
	"convex/ota/webhook_handler.ts",
	"convex/payments_stripe_actions.ts",
];

function* walk(dir: string): Generator<string> {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) yield* walk(path);
		else yield path;
	}
}

describe("HTTP routes read bodies through the bounded reader", () => {
	it("no route reads a request body unbounded", () => {
		const offenders: string[] = [];
		for (const file of walk(CONVEX_DIR)) {
			if (!file.endsWith(".ts")) continue;
			if (file.includes("/_generated/") || file.includes("/__tests__/")) continue;
			if (file.endsWith("/lib/requestBody.ts")) continue;
			const source = readFileSync(file, "utf-8");
			if (/\b(?:request|req)\.text\(\)/.test(source)) {
				offenders.push(file);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("every body-reading route uses the bounded reader", () => {
		for (const route of ROUTES_WITH_BODIES) {
			const source = readFileSync(join(REPO_ROOT, route), "utf-8");
			expect(source, route).toMatch(/readBodyWithLimit\(/);
		}
	});
});
