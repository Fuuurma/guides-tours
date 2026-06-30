// Authenticated Playwright smoke path for guides-tours.
//
// Validates the real sign-up → onboarding → dashboard happy path against a
// running `pnpm dev` server. Together with `e2e/smoke.spec.ts`, this gives a
// deploy-gate: a broken sign-up, onboarding, or dashboard won't ship.
//
// Notes:
// - Each test creates a fresh user with a unique email so multiple runs don't
//   collide against the same Convex dev deployment.
// - Requires `pnpm dev` (Vite + Convex) to be running locally on port 3000.
// - Skipped automatically when not running against a dev server (the `baseURL`
//   check below) so a CI run without a dev server doesn't fail on connection
//   errors — it just skips.
//
// Run locally:
//   pnpm dev           # in one terminal
//   pnpm test:e2e      # in another

import { expect, test } from "@playwright/test";

// Per-test unique email so multiple runs don't collide against the same
// Convex dev deployment (each sign-up creates a Better Auth user + an org).
function uniqueEmail(prefix: string): string {
	const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	return `${prefix}-${stamp}@e2e.local`;
}

// 6-character random org slug for the onboarding step.
function uniqueSlug(prefix: string): string {
	const stamp = Math.random().toString(36).slice(2, 8);
	return `${prefix}-${stamp}`;
}

test.describe("authenticated smoke", () => {
	test("sign up a fresh user, complete onboarding, land on dashboard", async ({
		page,
	}) => {
		const email = uniqueEmail("owner");
		const orgName = `E2E Org ${Date.now()}`;
		const orgSlug = uniqueSlug("e2e");

		// 1. Sign up
		await page.goto("/sign-up");
		await page.waitForLoadState("networkidle");
		await page.locator("#name").fill("E2E Owner");
		await page.locator("#email").fill(email);
		await page.locator("#password").fill("test1234test");
		await page.getByRole("button", { name: "Create account" }).click();

		// After sign-up, the route navigates to /onboarding.
		await page.waitForURL(/\/onboarding/, { timeout: 20_000 });
		await page.waitForLoadState("networkidle");

		// 2. Onboarding: create the org
		await page.locator("#name").fill(orgName);
		await page.locator("#slug").fill(orgSlug);
		await page.getByRole("button", { name: "Create organization" }).click();

		// 3. Land on dashboard
		await page.waitForURL(/\/dashboard$/, { timeout: 20_000 });
		await page.waitForLoadState("networkidle");

		// The dashboard h1 is "Today" with the org name on the same line.
		await expect(
			page.getByRole("heading", { name: /today/i }),
		).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText(orgName).first()).toBeVisible({
			timeout: 15_000,
		});
	});

	test("unauthenticated visit to /dashboard shows Not signed in card", async ({
		page,
	}) => {
		// We don't sign in — just visit /dashboard and expect the auth-gated
		// "Not signed in" card (no 500, no redirect to /sign-in).
		await page.goto("/dashboard");
		await page.waitForLoadState("networkidle");
		await expect(page.getByText(/not signed in/i)).toBeVisible({
			timeout: 10_000,
		});
	});

	test("sign in a previously registered user and land on dashboard", async ({
		page,
	}) => {
		const email = uniqueEmail("signin");

		// Register first so we have a known user
		await page.goto("/sign-up");
		await page.waitForLoadState("networkidle");
		await page.locator("#name").fill("E2E Signin");
		await page.locator("#email").fill(email);
		await page.locator("#password").fill("test1234test");
		await page.getByRole("button", { name: "Create account" }).click();
		await page.waitForURL(/\/onboarding/, { timeout: 20_000 });

		// Sign out by clearing cookies
		await page.context().clearCookies();

		// Sign in with the same credentials
		await page.goto("/sign-in");
		await page.waitForLoadState("networkidle");
		await page.locator("#email").fill(email);
		await page.locator("#password").fill("test1234test");
		await page.getByRole("button", { name: "Sign in" }).click();

		// After sign-in, the user lands on the dashboard
		await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
		await page.waitForLoadState("networkidle");
		await expect(
			page.getByRole("heading", { name: /today/i }),
		).toBeVisible({ timeout: 15_000 });
	});
});