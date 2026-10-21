// F934 — a read-only member could write every bookable surface of a
// tour: schedules, seasonal schedules, blackout dates, exception dates
// and the public gallery all admitted member through requireRole
// literals while the declared matrix grants member tour:["read"] only.
// F56/F405/F938 fixed the same class elsewhere.
//
// Structural pin (the staffCreateExceptionGate/bookingsListCustomerName
// idiom — Better Auth sessions cannot be exercised end-to-end in
// convex-test): each write path must bind to the declared matrix via
// requirePermission(ctx, "tour", <action>), and no member-admitting
// requireRole literal may remain in these files.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = [
	"tourSchedules",
	"tourSeasonalSchedules",
	"tourBlackoutDates",
	"tourExceptionDates",
	"tourImages",
] as const;

const src = (name: string) =>
	readFileSync(new URL(`../${name}.ts`, import.meta.url), "utf8");

// Public write path -> the tour action the matrix must authorize.
// generate mints concrete schedule rows (create); reorder rewrites
// gallery order (update).
//
// Surfaces with no caller were dropped (dead-code sweep
// fleet/guides-tours-ponytail): tourSchedules.create (the FE creates
// schedules through ops.staffDeparture, not this mutation),
// tourSeasonalSchedules.update, tourBlackoutDates.update and
// tourExceptionDates.update had no frontend caller. The
// "no member literal" scan above still covers every file, so a
// re-added surface that admits member is still caught.
const EXPECTED: Record<(typeof FILES)[number], Record<string, string>> = {
	tourSchedules: { update: "update" },
	tourSeasonalSchedules: {
		create: "create",
		generate: "create",
	},
	tourBlackoutDates: { create: "create" },
	tourExceptionDates: { create: "create" },
	tourImages: { add: "create", update: "update", reorder: "update" },
};

function bodyOf(file: string, fn: string): string {
	const body = src(file);
	const start = body.indexOf(`export const ${fn} = `);
	expect(start, `${file}.${fn} not found`).toBeGreaterThanOrEqual(0);
	const tail = body.slice(start);
	const next = tail.indexOf("\nexport const ");
	return next === -1 ? tail : tail.slice(0, next);
}

describe("member write gates on tour surfaces (F934)", () => {
	it("no member-admitting requireRole literal remains in the write files", () => {
		for (const name of FILES) {
			expect(
				src(name).includes('"member"'),
				`${name} still admits member in a literal`,
			).toBe(false);
		}
	});

	for (const [file, paths] of Object.entries(EXPECTED)) {
		for (const [fn, action] of Object.entries(paths)) {
			it(`${file}.${fn} binds requirePermission(tour, ${action})`, () => {
				expect(
					bodyOf(file, fn),
					`${file}.${fn} must gate on tour:${action}`,
				).toContain(`requirePermission(ctx, "tour", "${action}")`);
			});
		}
	}
});
