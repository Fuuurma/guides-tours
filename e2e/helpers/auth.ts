import { expect, type Page } from "@playwright/test";

/** Unique email so runs don't collide on a shared Convex deployment. */
export function uniqueEmail(prefix: string): string {
	const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	return `${prefix}-${stamp}@e2e.local`;
}

/** Short random org slug for onboarding. */
export function uniqueSlug(prefix: string): string {
	const stamp = Math.random().toString(36).slice(2, 8);
	return `${prefix}-${stamp}`;
}

/**
 * Wait until React has hydrated (RootDocument sets
 * `body[data-hydrated="true"]` on mount). Required before submitting
 * SSR-rendered forms.
 */
export async function waitForHydration(page: Page): Promise<void> {
	await page.locator("body[data-hydrated='true']").waitFor({
		state: "attached",
		timeout: 15_000,
	});
}

export type OnboardedSession = {
	email: string;
	password: string;
	orgName: string;
	orgSlug: string;
};

/** Sign in an existing Better Auth user and wait for the dashboard shell. */
export async function signIn(
	page: Page,
	credentials: { email: string; password: string },
): Promise<void> {
	await page.goto("/sign-in");
	await page.locator("#email").waitFor({ state: "visible" });
	await waitForHydration(page);
	await page.locator("#email").fill(credentials.email);
	await page.locator("#password").fill(credentials.password);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL(/\/dashboard(?:$|\/)/, { timeout: 60_000 });
}

/**
 * Sign up a fresh user, create an organization, land on /dashboard.
 */
export async function signUpAndOnboard(
	page: Page,
	opts?: { namePrefix?: string },
): Promise<OnboardedSession> {
	const prefix = opts?.namePrefix ?? "ops";
	const email = uniqueEmail(prefix);
	const password = "test1234test";
	const orgName = `E2E ${prefix} ${Date.now()}`;
	const orgSlug = uniqueSlug(prefix);

	await page.goto("/sign-up");
	await page.locator("#name").waitFor({ state: "visible" });
	await waitForHydration(page);
	await page.locator("#name").fill("E2E Owner");
	await page.locator("#email").fill(email);
	await page.locator("#password").fill(password);
	await page.getByRole("button", { name: "Create account" }).click();

	await page.waitForURL(/\/onboarding/, { timeout: 60_000 });
	await page.locator("#slug").waitFor({ state: "visible" });
	await waitForHydration(page);
	await page.locator("#name").fill(orgName);
	await page.locator("#slug").fill(orgSlug);
	await page.getByRole("button", { name: "Create organization" }).click();

	await page.waitForURL(/\/dashboard$/, { timeout: 120_000 });
	await page
		.getByRole("heading", { name: /today/i })
		.waitFor({ state: "visible", timeout: 15_000 });
	await expect(page.getByText(orgName).first()).toBeVisible({
		timeout: 15_000,
	});

	return { email, password, orgName, orgSlug };
}

/** Create a tour via the dashboard form. Returns the detail URL. */
export async function createTourViaUi(
	page: Page,
	name: string,
): Promise<string> {
	await page.goto("/dashboard/tours/new");
	await waitForHydration(page);
	await page.locator("#name").waitFor({ state: "visible" });
	await page.locator("#name").fill(name);
	const duration = page.locator("#dur");
	if (await duration.count()) {
		await duration.fill("2");
	}
	const capacity = page.locator("#cap");
	if (await capacity.count()) {
		await capacity.fill("12");
	}
	const maxGuests = page.locator("#max");
	if (await maxGuests.count()) {
		await maxGuests.fill("12");
	}
	await page.getByRole("button", { name: /create tour/i }).click();
	await page.waitForURL(
		(url) =>
			/^\/dashboard\/tours\/[^/]+$/.test(url.pathname) &&
			url.pathname !== "/dashboard/tours/new",
		{ timeout: 60_000 },
	);
	return page.url();
}
