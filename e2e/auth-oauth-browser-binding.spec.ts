import { expect, test } from "@playwright/test";

// A copied OTT callback must not authenticate a browser that did not start OAuth.
test("a copied OAuth callback is rejected in a clean browser", async ({
	page,
}) => {
	let verificationRequests = 0;
	await page.route(
		"**/api/auth/cross-domain/one-time-token/verify",
		async (route) => {
			verificationRequests += 1;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ session: { token: "attacker-session" } }),
			});
		},
	);

	const callback = new URL("/auth/callback", "http://localhost");
	callback.searchParams.set("ott", "attacker-owned-token");
	callback.searchParams.set("oauthBinding", "A".repeat(43));
	callback.searchParams.set("redirect", "/dashboard");
	const response = await page.goto(`${callback.pathname}${callback.search}`);
	expect(response?.status()).toBeLessThan(500);
	await expect(page).toHaveURL(/\/sign-in(?:\?|$)/, { timeout: 15_000 });
	expect(verificationRequests).toBe(0);
});
