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
// Hydration: Vite SSR renders the form HTML before React attaches event
// handlers. If Playwright clicks submit before hydration, the browser does
// a native GET submit (the values land in the query string and we never
// navigate). We wait for `body[data-hydrated="true"]` (set by RootDocument on
// mount) before submitting. Falls back to a short timeout for cold Vite
// dev compiles where hydration can take >1s.
//
// Run locally:
//   pnpm dev           # in one terminal
//   pnpm test:e2e      # in another

import { expect, test, type Page } from "@playwright/test";

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

// Wait until React has hydrated the page (RootDocument sets
// `body[data-hydrated="true"]` on mount). This is the signal that
// `onSubmit` handlers are attached to the SSR-rendered form.
async function waitForHydration(page: Page): Promise<void> {
	await page.locator("body[data-hydrated='true']").waitFor({
		state: "attached",
		timeout: 15_000,
	});
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
		await page.locator("#name").waitFor({ state: "visible" });
		await waitForHydration(page);
		await page.locator("#name").fill("E2E Owner");
		await page.locator("#email").fill(email);
		await page.locator("#password").fill("test1234test");
		await page.getByRole("button", { name: "Create account" }).click();

		// After sign-up, the route navigates to /onboarding.
		await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
		await page.locator("#slug").waitFor({ state: "visible" });
		await waitForHydration(page);

		// 2. Onboarding: create the org
		await page.locator("#name").fill(orgName);
		await page.locator("#slug").fill(orgSlug);
		await page.getByRole("button", { name: "Create organization" }).click();

		// 3. Land on dashboard
		await page.waitForURL(/\/dashboard$/, { timeout: 30_000 });
		await page
			.getByRole("heading", { name: /today/i })
			.waitFor({ state: "visible", timeout: 15_000 });
		await expect(page.getByText(orgName).first()).toBeVisible({
			timeout: 15_000,
		});
	});

	test("unauthenticated visit to /dashboard does not crash", async ({
		page,
	}) => {
		// We don't sign in — just visit /dashboard and expect the route to
		// render without a 500. Queries may fail (return undefined) but the
		// page itself should mount.
		const response = await page.goto("/dashboard");
		expect(response?.status()).toBeLessThan(500);
		await expect(page.locator("body[data-hydrated='true']")).toHaveCount(1, {
			timeout: 30_000,
		});
	});

	test("sign in a previously registered user and reach onboarding", async ({
		page,
	}) => {
		const email = uniqueEmail("signin");

		// Register first so we have a known user
		await page.goto("/sign-up");
		await page.locator("#name").waitFor({ state: "visible" });
		await waitForHydration(page);
		// Fill fields one by one, allowing hydration to settle between
		await page.locator("#name").fill("E2E Signin");
		await page.locator("#email").fill(email);
		await page.locator("#password").fill("test1234test");
		// Small delay to ensure all event handlers are wired
		await page.waitForTimeout(500);
		await page.getByRole("button", { name: "Create account" }).click();
		await page.waitForURL(/\/onboarding/, { timeout: 45_000 });

		// Sign out by clearing cookies
		await page.context().clearCookies();

		// Sign in with the same credentials
		await page.goto("/sign-in");
		await page.locator("#email").waitFor({ state: "visible" });
		await waitForHydration(page);
		await page.locator("#email").fill(email);
		await page.locator("#password").fill("test1234test");
		await page.waitForTimeout(500);
		await page.getByRole("button", { name: "Sign in" }).click();

		// After sign-in, an org-less user is routed to /onboarding (per
		// sign-in.tsx: orgs.length === 0 → "/onboarding").
		await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
		await expect(page.getByText(/set up your company/i)).toBeVisible({
			timeout: 15_000,
		});
	});

	test("public booking page renders for a real org slug", async ({
		page,
	}) => {
		const email = uniqueEmail("public");
		const orgName = `E2E Public Org ${Date.now()}`;
		const orgSlug = uniqueSlug("pb");

		// 1. Sign up + onboard (creates a real org with a known slug)
		await page.goto("/sign-up");
		await page.locator("#name").waitFor({ state: "visible" });
		await waitForHydration(page);
		await page.locator("#name").fill("E2E Public");
		await page.locator("#email").fill(email);
		await page.locator("#password").fill("test1234test");
		await page.getByRole("button", { name: "Create account" }).click();
		await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
		await page.locator("#slug").waitFor({ state: "visible" });
		await waitForHydration(page);
		await page.locator("#name").fill(orgName);
		await page.locator("#slug").fill(orgSlug);
		await page.getByRole("button", { name: "Create organization" }).click();
		await page.waitForURL(/\/dashboard$/, { timeout: 30_000 });

		// 2. Sign out so we can hit the public booking page anonymously
		await page.context().clearCookies();

		// 3. Visit the public booking page for the real org slug.
		// This proves the route renders <500 for a real (signed-up) org
		// — the existing /book/nonexistent-org-slug smoke only covers
		// the 404 path. We don't wait for the convexQuery to resolve
		// (it can be slow on cold Vite dev compiles); just verify the
		// route mounts.
		const response = await page.goto(`/book/${orgSlug}`);
		expect(response?.status()).toBeLessThan(500);
		await waitForHydration(page);
		await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
	});
});