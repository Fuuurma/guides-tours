import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { VEHICLE_STATUSES, vehicleStatusValidator } from "../vehicleStatus";

/**
 * F696: the vehicle status set was hand-written in five places — the schema
 * table and four mutations — and two of those mutations accepted any string
 * at all. The set now lives in one declaration, and these pins keep it
 * there.
 */

const CONVEX_ROOT = resolve(__dirname, "../..");

function convexSources(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			if (entry === "__tests__" || entry === "_generated") continue;
			out.push(...convexSources(full));
			continue;
		}
		if (full.endsWith(".ts") && !full.endsWith(".test.ts")) out.push(full);
	}
	return out;
}

describe("vehicle status declaration", () => {
	it("the validator names exactly the declared statuses", () => {
		const members = (
			vehicleStatusValidator as unknown as { members: Array<{ value: string }> }
		).members;
		expect(members.map((m) => m.value)).toEqual([...VEHICLE_STATUSES]);
	});

	it("the status literals are declared once in the convex tree", () => {
		// "in_use" belongs to the vehicle status set alone, so it is the
		// sentinel: a hand-written copy anywhere else is a copy that can drift.
		const offenders = convexSources(CONVEX_ROOT).filter((file) =>
			readFileSync(file, "utf8").includes('v.literal("in_use")'),
		);
		expect(offenders.map((f) => f.replace(CONVEX_ROOT, ""))).toEqual([
			"/lib/vehicleStatus.ts",
		]);
	});
});
