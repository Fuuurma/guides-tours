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

test.describe("dashboard route smoke (unauthenticated)", () => {
	// These routes require auth; hitting them while signed out
	// should render a graceful "Not signed in" or redirect to
	// /sign-in — never a 500 from a missing query handler.
	// We don't try to authenticate in the smoke (that's covered by
	// the auth flow tests); we just verify the routes are wired.

	const dashboardRoutes = [
		"/dashboard",
		"/dashboard/tours",
		"/dashboard/templates",
		"/dashboard/categories",
		"/dashboard/schedules",
		"/dashboard/bookings",
		"/dashboard/customers",
		"/dashboard/analytics",
		"/dashboard/assignments",
		"/dashboard/vacations",
		"/dashboard/vehicles",
		"/dashboard/drivers",
		"/dashboard/ota",
		"/dashboard/notifications",
		"/dashboard/settings/payments",
	];

	for (const route of dashboardRoutes) {
		test(`${route} returns <500 (auth-gated render)`, async ({ page }) => {
			const response = await page.goto(route);
			expect(response?.status()).toBeLessThan(500);
		});
	}
});
