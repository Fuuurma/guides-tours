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
			SITE_URL: "http://localhost:3000",
		},
		// jsdom is needed for any test that uses @testing-library/react.
		// Component tests opt in via `// @vitest-environment jsdom` at
		// the top of the file (so convex/ Node-crypto tests stay on the
		// fast node environment).
		//
		// Auto-register the testing-library cleanup hook so component
		// tests don't leak DOM between tests.
		setupFiles: ["./src/__tests__/setup.ts"],
	},
});
