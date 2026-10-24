import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { timingSafeEqual } from "../timing";

/**
 * F836 / F852: the constant-time byte compare must have ONE
 * implementation. Both findings were the same defect wearing two coats —
 * a second hand-rolled `timingSafeEqual` that early-returned on a length
 * mismatch while the canonical one compared over the longer input. The
 * two drifted because the primitive had no shared home.
 *
 * The pin fails the moment a module defines its own copy again, which is
 * the "lint-pin the seam" half of the finding. The shared implementation
 * lives in convex/lib/timing.ts; everything else must import it.
 */
const CONVEX_DIR = join(__dirname, "..", "..");
const SHARED_SOURCE = "convex/lib/timing.ts";
const LOCAL_DEFINITION = /function\s+timingSafeEqual\s*\(/;

function* walk(dir: string): Generator<string> {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) yield* walk(path);
		else yield path;
	}
}

describe("timingSafeEqual has a single source", () => {
	it("no convex module defines its own copy", () => {
		const offenders: string[] = [];
		for (const file of walk(CONVEX_DIR)) {
			if (!/\.ts$/.test(file)) continue;
			const rel = relative(process.cwd(), file).split("\\").join("/");
			if (rel === SHARED_SOURCE || rel.includes("__tests__")) continue;
			if (LOCAL_DEFINITION.test(readFileSync(file, "utf8"))) {
				offenders.push(rel);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("the shared compare rejects a length mismatch", () => {
		// The F466 body compares over the LONGER input and seeds the diff
		// with the length bit, so a mismatch is false without a leak path
		// and without throwing.
		expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(
			false,
		);
		expect(timingSafeEqual(new Uint8Array(0), new Uint8Array([0xff]))).toBe(false);
		expect(timingSafeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
	});
});
