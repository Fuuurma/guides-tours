import { defineConfig } from "vitest/config";

export default defineConfig({
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
	},
});
