/**
 * Authenticated ops flows: calendar deep-link, guides/availability,
 * and tour gallery surface. Requires `pnpm dev` on :3020.
 */
import { expect, test } from "@playwright/test";
import { localYmd } from "../src/lib/calendar-date";
import {
	createTourViaUi,
	signUpAndOnboard,
	waitForHydration,
} from "./helpers/auth";

test.describe("authenticated ops", () => {
	test.setTimeout(240_000);

	test.beforeAll(async ({ browser }) => {
		const ctx = await browser.newContext();
		const page = await ctx.newPage();
		for (const route of [
			"/sign-up",
			"/onboarding",
			"/dashboard",
			"/dashboard/calendar",
			"/dashboard/guides",
			"/dashboard/tours/new",
		]) {
			try {
				await page.goto(route, { waitUntil: "domcontentloaded" });
				await page.waitForTimeout(300);
			} catch {
				// best-effort warm
			}
		}
		await ctx.close();
	});

	test("calendar deep-link prefills assignment date", async ({ page }) => {
		await signUpAndOnboard(page, { namePrefix: "cal" });

		await page.goto("/dashboard/calendar");
		await waitForHydration(page);
		await expect(
			page.getByRole("heading", { name: /calendar/i }),
		).toBeVisible({ timeout: 30_000 });

		const today = localYmd(new Date());
		await page.goto(`/dashboard/assignments/new?date=${today}`);
		await waitForHydration(page);
		const dateInput = page.locator("#date");
		await dateInput.waitFor({ state: "visible", timeout: 30_000 });
		await expect(dateInput).toHaveValue(today);
	});

	test("guides roster opens availability grid for owner", async ({
		page,
	}) => {
		await signUpAndOnboard(page, { namePrefix: "guide" });

		await page.goto("/dashboard/guides");
		await waitForHydration(page);
		await expect(page.getByRole("heading", { name: /guides/i })).toBeVisible({
			timeout: 30_000,
		});

		// Owner is guide-capable — first roster link goes to detail.
		const firstGuide = page.locator("a[href*='/dashboard/guides/']").first();
		await expect(firstGuide).toBeVisible({ timeout: 30_000 });
		await firstGuide.click();
		await page.waitForURL(/\/dashboard\/guides\/.+/, { timeout: 30_000 });
		await waitForHydration(page);
		await expect(
			page.getByRole("heading", { level: 1 }),
		).toBeVisible();
		await expect(page.getByText(/availability/i).first()).toBeVisible({
			timeout: 15_000,
		});

		// Toggle a day in the month grid (first day button that looks like a date cell).
		const dayBtn = page.locator("button").filter({ hasText: /^1$/ }).first();
		if (await dayBtn.count()) {
			await dayBtn.click();
			// Toast or cell state change — don't assert toast text tightly.
			await page.waitForTimeout(500);
		}
	});

	test("tour detail exposes gallery upload control", async ({ page }) => {
		await signUpAndOnboard(page, { namePrefix: "gallery" });
		const tourName = `Gallery Tour ${Date.now()}`;
		await createTourViaUi(page, tourName);
		await waitForHydration(page);

		await expect(page.getByText(/photos/i).first()).toBeVisible({
			timeout: 30_000,
		});
		await expect(
			page.getByRole("button", { name: /upload/i }),
		).toBeVisible();
		// File input is hidden; presence is enough for smoke (real upload
		// needs a blob and Convex storage — covered by unit tests).
		await expect(page.locator('input[type="file"][accept="image/*"]')).toHaveCount(
			1,
		);
	});

	test("OTA page shows webhook URLs and deliveries panel", async ({
		page,
	}) => {
		await signUpAndOnboard(page, { namePrefix: "ota" });
		await page.goto("/dashboard/ota");
		await waitForHydration(page);
		await expect(
			page.getByRole("heading", { name: /ota integrations/i }),
		).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText(/webhook urls/i).first()).toBeVisible();
		await expect(
			page.getByText(/recent webhook deliveries/i).first(),
		).toBeVisible();
		await expect(page.getByText(/\/api\/ota\/webhooks\//).first()).toBeVisible();
	});

	test("new booking form mounts and notifications list loads", async ({
		page,
	}) => {
		await signUpAndOnboard(page, { namePrefix: "bookform" });

		await page.goto("/dashboard/bookings/new");
		await waitForHydration(page);
		await expect(
			page.getByRole("heading", { name: /new booking/i }),
		).toBeVisible({ timeout: 30_000 });
		await expect(page.locator("#tour")).toBeVisible();

		await page.goto("/dashboard/notifications");
		await waitForHydration(page);
		await expect(
			page.getByRole("heading", { name: /notifications/i }).first(),
		).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText(/recent deliveries/i).first()).toBeVisible({
			timeout: 15_000,
		});
	});
});
