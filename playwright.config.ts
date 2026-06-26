// Playwright smoke config for guides-tours.
//
// Runs a minimal end-to-end smoke against `pnpm dev` (already running
// on localhost:3000) — sign-up → onboarding → dashboard. Acts as a
// deploy-gate so a broken frontend never reaches prod.
//
// To run locally:
//   pnpm dev           # in one terminal
//   pnpm test:e2e      # in another
//
// In CI, start the dev server with `pnpm preview` (after `pnpm build`)
// and run the same command.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	timeout: 30_000,
	expect: { timeout: 5_000 },
	fullyParallel: false, // single Convex dev deployment
	retries: 0,
	workers: 1,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
