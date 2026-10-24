import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
	resolve: {
		// Match tsconfig path aliases so component tests can import via @/...
		alias: {
			"@/": `${resolve(__dirname, "src")}/`,
			"#/": `${resolve(__dirname, "src")}/`,
		},
	},
	test: {
		// Node environment — needed for the crypto + fs-based tests.
		// The full app vite.config.ts has the Cloudflare plugin which
		// forbids Node built-ins; vitest doesn't need any of that.
		environment: "node",
		// crypto.ts lives under convex/lib/ and uses `node:crypto`.
		// Other tests under src/ should keep jsdom — switch per file if
		// needed via the comment directive at top of file.
		include: [
			"convex/**/__tests__/**/*.test.ts",
			"src/**/*.test.{ts,tsx}",
		],
		// convex/auth.ts throws at module-load if SITE_URL is missing.
		// Set a dummy value so importing the auth chain (transitively
		// pulled in by convex/payments.ts → convex/lib/authz) works.
		env: {
			SITE_URL: "http://127.0.0.1:3020",
		},
		// jsdom is needed for any test that uses @testing-library/react.
		// Component tests opt in via `// @vitest-environment jsdom` at
		// the top of the file (so convex/ Node-crypto tests stay on the
		// fast node environment).
		//
		// Auto-register the testing-library cleanup hook so component
		// tests don't leak DOM between tests.
		setupFiles: ["./src/__tests__/setup.ts"],
		// Vitest's default per-test ceiling is 5s, and the most expensive
		// operation in this suite is the FIRST convexTest() boot in a file
		// — it starts an in-memory backend and imports the whole module
		// graph. Idle that boot takes ~200-500ms, but the landing lane
		// runs this gate while the rest of the fleet holds the CPU, and on
		// 2026-10-22 that boot overran the ceiling in three files
		// (customers, public_booking_http_security, notifications/crons):
		// "Test timed out in 5000ms". The lane reads a gate failure as a
		// defect and holds the branch — it held
		// fleet/guides-tours-dep-floors and fleet/guides-tours-stripe-body-
		// bound on it, and the latter landed UNCHANGED on the next run,
		// which is what proves the timeout, not the code, was at fault.
		//
		// The ceiling is a scheduling allowance, not an assertion: a test
		// that genuinely hangs still fails, just 30s later.
		testTimeout: 30_000,
		hookTimeout: 30_000,
	},
});
