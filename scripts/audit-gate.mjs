#!/usr/bin/env node
/**
 * Production dependency advisory gate (F952).
 *
 * Runs `pnpm audit --prod` against this repo's own manifests and fails the
 * build when the production graph carries an advisory that is not on the
 * sanctioned list below. The point is drift protection: the undici/sharp/
 * seroval floors in pnpm-workspace.yaml must not silently regress, and no
 * new advisory may enter the production graph unnoticed.
 *
 * Why this is not a bare `pnpm audit --prod` step:
 *  - `pnpm audit --prod` exits 1 for the advisories that other findings own
 *    (TanStack Start XSS, vite/postcss/vitest), so it can never be the CI
 *    step as it stands.
 *  - pnpm 10.30.2's own exception mechanism cannot be the CI step either:
 *    `--ignore` rewrites pnpm-workspace.yaml (auditConfig.ignoreCves) and,
 *    with any ignore list present, the audit then reports nothing and exits
 *    0. It would rubber-stamp every future advisory as well.
 *
 * Each sanctioned entry names the fix version, so it can be dropped the
 * moment its floor is lifted.
 */

import { spawnSync } from "node:child_process"

// GHSA id → why this advisory is tolerated and what closes it.
//
// GHSA-qx66-fv34-fjm8 (TanStack Start reflected XSS) used to be listed
// here: the floors deliberately left the Start bump alone because a
// separate finding owned it. That bump has landed (@tanstack/react-start
// 1.169.3, start-server-core 1.169.44), so the entry is gone and the
// gate now fails if the Start advisory ever comes back.
const SANCTIONED = new Map([
	[
		"GHSA-587h-7wmj-h5pm",
		"vite >= 8.1.6 — vite reaches the production graph through @cloudflare/vite-plugin.",
	],
	[
		"GHSA-698v-4r3x-3vcv",
		"vite >= 8.1.6 — vite reaches the production graph through @cloudflare/vite-plugin.",
	],
	[
		"GHSA-9jrq-w75r-8gcw",
		"vite >= 8.1.6 — vite reaches the production graph through @cloudflare/vite-plugin.",
	],
	[
		"GHSA-r825-w8mm-5pxw",
		"vite >= 8.1.6 — vite reaches the production graph through @cloudflare/vite-plugin.",
	],
	[
		"GHSA-rq7h-c2jc-7f22",
		"vite >= 8.1.6 — vite reaches the production graph through @cloudflare/vite-plugin.",
	],
	[
		"GHSA-2v37-7h3g-55p8",
		"nanoid >= 3.3.18 — nanoid reaches the production graph through vite > postcss.",
	],
	[
		"GHSA-fxqj-rqcc-2cmp",
		"postcss >= 8.5.23 — postcss reaches the production graph through vite.",
	],
	[
		"GHSA-68fv-2mgg-jv7q",
		"source-map-js >= 1.2.2 — source-map-js reaches the production graph through vite > postcss.",
	],
	[
		"GHSA-82fw-gwwq-j7x9",
		"vitest >= 4.1.11 — vitest reaches the production graph through better-auth's optional peer.",
	],
	[
		"GHSA-qxg6-89mg-rqv8",
		"@vitest/mocker >= 4.1.12 — same vitest edge as GHSA-82fw-gwwq-j7x9.",
	],
])

const audit = spawnSync("pnpm", ["audit", "--prod", "--json"], {
	encoding: "utf8",
	maxBuffer: 64 * 1024 * 1024,
})

if (audit.error) {
	console.error(`audit gate: could not run pnpm audit — ${audit.error.message}`)
	process.exit(1)
}

let report
try {
	report = JSON.parse(audit.stdout)
} catch {
	console.error("audit gate: pnpm audit did not return a JSON report — failing closed.")
	if (audit.stdout?.trim()) console.error(audit.stdout.trim())
	if (audit.stderr?.trim()) console.error(audit.stderr.trim())
	process.exit(1)
}

const advisories = Object.values(report.advisories ?? {}).map((advisory) => ({
	id:
		advisory.references?.match(/advisories\/(GHSA-[a-z0-9-]+)/)?.[1] ??
		`npm-${advisory.id}`,
	package: advisory.module_name ?? "unknown",
	severity: advisory.severity ?? "unknown",
	vulnerable: advisory.vulnerable_versions ?? "unknown",
	patched: advisory.patched_versions ?? "unknown",
	paths: [
		...new Set(
			(advisory.findings ?? []).flatMap((finding) => finding.paths ?? []),
		),
	],
}))

const unsanctioned = advisories.filter((advisory) => !SANCTIONED.has(advisory.id))
const seen = new Set(advisories.map((advisory) => advisory.id))
const stale = [...SANCTIONED.keys()].filter((id) => !seen.has(id))

console.log(
	`audit gate — pnpm audit --prod: ${advisories.length} advisories in the production graph (${seen.size} ids), ${seen.size - unsanctioned.length} sanctioned, ${unsanctioned.length} unsanctioned.`,
)

if (unsanctioned.length > 0) {
	console.log("")
	for (const advisory of unsanctioned) {
		console.log(
			`✗ ${advisory.id}  ${advisory.severity}  ${advisory.package}  ${advisory.vulnerable} -> ${advisory.patched}`,
		)
		for (const path of advisory.paths) console.log(`    ${path}`)
	}
	console.log("")
	console.error(
		"audit gate: unsanctioned advisories in the production graph. Fix them, or sanction them in scripts/audit-gate.mjs with the fix version.",
	)
	process.exit(1)
}

if (seen.size > 0) {
	console.log("")
	for (const id of [...seen].sort()) {
		const packages = [
			...new Set(
				advisories
					.filter((advisory) => advisory.id === id)
					.map((advisory) => advisory.package),
			),
		]
		console.log(`○ ${id}  ${packages.join(", ")}`)
		console.log(`    sanctioned: ${SANCTIONED.get(id)}`)
	}
}

if (stale.length > 0) {
	console.log("")
	console.log(
		`! sanctioned but no longer reported (drop these entries): ${stale.join(", ")}`,
	)
}

console.log("")
console.log("audit gate: no unsanctioned advisories in the production graph.")
process.exit(0)
