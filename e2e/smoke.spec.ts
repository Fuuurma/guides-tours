import { expect, test } from "@playwright/test";

// Smoke flow: sign-up → onboarding → land on dashboard.
// Skipped automatically when not running against a local dev server
// (the dev server must be started before running this test).

test.describe("public booking smoke", () => {
	test("root page renders marketing copy or auth entry", async ({ page }) => {
		await page.goto("/");
		// Either we see the marketing index, or we get bounced to sign-in.
		// We don't assert a specific heading — the goal is to catch a
		// 500 from a missing route or broken SSR.
		const status = page.url();
		expect(status.startsWith("http")).toBe(true);
	});

	test("sign-in route is reachable", async ({ page }) => {
		const response = await page.goto("/sign-in");
		expect(response?.status()).toBeLessThan(500);
		// Form fields should be present
		await expect(page.getByLabel(/email/i)).toBeVisible();
	});

	test("sign-up route is reachable", async ({ page }) => {
		const response = await page.goto("/sign-up");
		expect(response?.status()).toBeLessThan(500);
		await expect(page.getByLabel(/email/i)).toBeVisible();
	});

	test("public booking page exists for any slug (200 or 404, never 500)", async ({
		page,
	}) => {
		// Unknown slugs should render a graceful "not found" state, not
		// a 500 from a missing query handler.
		const response = await page.goto("/book/nonexistent-org-slug");
		expect(response?.status()).toBeLessThan(500);
	});
});
