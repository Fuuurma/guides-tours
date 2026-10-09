import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * F724 seam pin: raw getErrorMessage text must never reach a display seam
 * again — it renders engine text (request IDs, plan-limit blobs, network
 * failures) verbatim to users. Every toast/banner now goes through
 * getSafeDisplayMessage. The pin fails the suite the moment a new call
 * site lands, which is the "lint-pin the seam" half of the finding.
 *
 * Sanctioned raw uses:
 * - src/lib/utils.ts — the function's own definition.
 * - new-vacation-page.tsx — parses the authored
 *   VACATION_ASSIGNMENT_CONFLICT code prefix; the displayed branch uses
 *   getSafeDisplayMessage. Exactly one call site may exist there.
 */

const SRC = join(__dirname, "..");
const DEFINITION_FILE = "src/lib/utils.ts";
const PREFIX_MATCH_FILE = "src/components/pages/new-vacation-page.tsx";
const RAW_CALL = /getErrorMessage\s*\(/g;

function* walk(dir: string): Generator<string> {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) yield* walk(path);
		else yield path;
	}
}

describe("raw-error display seam (F724)", () => {
	it("no display site calls getErrorMessage directly", () => {
		const offenders: string[] = [];
		for (const file of walk(SRC)) {
			if (!/\.(ts|tsx)$/.test(file)) continue;
			const rel = relative(process.cwd(), file).split("\\").join("/");
			if (rel === DEFINITION_FILE || rel.includes("__tests__")) continue;
			const count = (readFileSync(file, "utf8").match(RAW_CALL) ?? []).length;
			if (rel === PREFIX_MATCH_FILE) {
				expect(count).toBe(1);
				continue;
			}
			if (count > 0) offenders.push(`${rel} (${count})`);
		}
		expect(offenders).toEqual([]);
	});
});
