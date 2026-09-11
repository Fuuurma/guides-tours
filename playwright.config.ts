// Playwright smoke config for guides-tours.
//
// Runs a minimal end-to-end smoke against `pnpm dev` — sign-up →
// onboarding → dashboard. Acts as a deploy-gate so a broken frontend
// never reaches prod. The `webServer` block starts the dev server
// automatically when nothing is listening on 3020 (and reuses a live
// one locally), so `pnpm test:e2e` works standalone.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	timeout: 30_000,
	expect: { timeout: 5_000 },
	fullyParallel: false, // single Convex dev deployment
	retries: 0,
	workers: 1,
	reporter: process.env.CI ? "github" : "list",
	webServer: {
		command: "pnpm dev",
		url: "http://127.0.0.1:3020",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3020",
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
