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

	test("staffing page loads readiness and phone-remind settings", async ({
		page,
	}) => {
		await signUpAndOnboard(page, { namePrefix: "staff" });

		await page.goto("/dashboard/staffing");
		await waitForHydration(page);
		await expect(
			page.getByRole("heading", { name: /staffing/i }),
		).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText(/date range/i).first()).toBeVisible();
		await expect(
			page
				.getByText(/fully staffed|gap|missing phone|no upcoming/i)
				.first(),
		).toBeVisible({ timeout: 30_000 });

		await page.goto("/dashboard/notifications/settings");
		await waitForHydration(page);
		await expect(
			page.getByRole("heading", { name: /notification settings/i }),
		).toBeVisible({ timeout: 30_000 });
		await expect(
			page.getByText(/also email assigned staff who are missing a phone/i),
		).toBeVisible({ timeout: 15_000 });
	});

	test("staffing shows multi-guide gap after partial assign", async ({
		page,
	}) => {
		await signUpAndOnboard(page, { namePrefix: "gap" });
		const tourName = `Gap Tour ${Date.now()}`;

		await page.goto("/dashboard/tours/new");
		await waitForHydration(page);
		await page.locator("#name").fill(tourName);
		const reqGuides = page.locator("#req-guides");
		await reqGuides.waitFor({ state: "visible" });
		await reqGuides.fill("2");
		await page.getByRole("button", { name: /create tour/i }).click();
		await page.waitForURL(/\/dashboard\/tours\/[^/]+$/, { timeout: 60_000 });

		const today = localYmd(new Date());
		await page.goto(`/dashboard/assignments/new?date=${today}`);
		await waitForHydration(page);
		await page.locator("#tour").waitFor({ state: "visible", timeout: 30_000 });
		await page.locator("#tour").click();
		await page.getByRole("option", { name: tourName }).click();
		await page.locator("#guide").click();
		await page.getByRole("option").first().click();
		await page.locator("#start").fill("10:00");
		await page.getByRole("button", { name: /create assignment/i }).click();
		await page.waitForURL(/\/dashboard\/assignments\/[^/]+$/, {
			timeout: 60_000,
		});

		await page.goto("/dashboard/staffing");
		await waitForHydration(page);
		await expect(page.getByText(tourName).first()).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByText(/needs guides/i).first()).toBeVisible();
		await expect(page.getByText(/guides 1\/2/i).first()).toBeVisible();
	});

	test("analytics page shows KPIs and tour revenue chart", async ({
		page,
	}) => {
		await signUpAndOnboard(page, { namePrefix: "analytics" });
		await page.goto("/dashboard/analytics");
		await waitForHydration(page);
		await expect(
			page.getByRole("heading", { name: /analytics/i }),
		).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText(/total bookings/i).first()).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText(/tour revenue \(cached\)/i).first()).toBeVisible();
		await expect(page.getByText(/top tours/i).first()).toBeVisible();
	});

	test("payment settings shows Stripe webhook endpoint", async ({ page }) => {
		await signUpAndOnboard(page, { namePrefix: "payset" });
		await page.goto("/dashboard/settings/payments");
		await waitForHydration(page);
		await expect(
			page.getByRole("heading", { name: /payment/i }).first(),
		).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText(/webhook endpoint/i).first()).toBeVisible({
			timeout: 15_000,
		});
		await expect(
			page.getByText(/\/api\/payments\/stripe\/webhook/).first(),
		).toBeVisible();
		await expect(page.getByLabel(/publishable key/i)).toBeVisible();

		// Save a sandbox publishable key so booking detail can offer Elements.
		await page.locator("#pubKey").fill("pk_test_e2e_placeholder");
		await page.getByLabel(/stripe enabled/i).check();
		await page.getByRole("button", { name: /save/i }).click();
		await expect(page.getByText(/payment settings saved/i)).toBeVisible({
			timeout: 15_000,
		});
	});

	test("files admin page loads empty state", async ({ page }) => {
		await signUpAndOnboard(page, { namePrefix: "files" });
		await page.goto("/dashboard/files");
		await waitForHydration(page);
		await expect(page.getByRole("heading", { name: /files/i })).toBeVisible({
			timeout: 30_000,
		});
		await expect(
			page.getByText(/no uploaded files yet|uploaded file/i).first(),
		).toBeVisible({ timeout: 15_000 });
		await expect(page.getByLabel(/filter by purpose/i)).toBeVisible();
	});

	test("booking detail offers Elements and Checkout collect actions", async ({
		page,
	}) => {
		await signUpAndOnboard(page, { namePrefix: "paycol" });

		await page.goto("/dashboard/settings/payments");
		await waitForHydration(page);
		await page.locator("#pubKey").waitFor({ state: "visible", timeout: 30_000 });
		await page.locator("#pubKey").fill("pk_test_e2e_placeholder");
		const enabled = page.getByLabel(/stripe enabled/i);
		if (!(await enabled.isChecked())) {
			await enabled.check();
		}
		await page.getByRole("button", { name: /save/i }).click();
		await expect(page.getByText(/payment settings saved/i)).toBeVisible({
			timeout: 15_000,
		});

		const tourName = `Pay Tour ${Date.now()}`;
		await createTourViaUi(page, tourName);

		await page.goto("/dashboard/customers/new");
		await waitForHydration(page);
		const custName = `Pay Guest ${Date.now()}`;
		await page.locator("#name").fill(custName);
		await page.locator("#email").fill(`pay-${Date.now()}@e2e.local`);
		await page.getByRole("button", { name: /create customer/i }).click();
		await page.waitForURL(/\/dashboard\/customers\/[^/]+$/, { timeout: 60_000 });

		const today = localYmd(new Date());
		await page.goto("/dashboard/bookings/new");
		await waitForHydration(page);
		await page.locator("#tour").waitFor({ state: "visible", timeout: 30_000 });
		await page.locator("#tour").click();
		await page.getByRole("option", { name: tourName }).click();
		await page.locator("#customer").click();
		await page.getByRole("option", { name: new RegExp(custName) }).click();
		await page.locator("#date").fill(today);
		await page.locator("#time").fill("11:00");
		await page.locator("#total").fill("120.00");
		await page.getByRole("button", { name: /create booking/i }).click();
		await page.waitForURL(/\/dashboard\/bookings\/[^/]+$/, { timeout: 60_000 });
		await waitForHydration(page);

		await expect(page.getByText(/collect/i).first()).toBeVisible({
			timeout: 30_000,
		});
		await expect(
			page.getByRole("button", { name: /pay on this page/i }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /open stripe checkout/i }),
		).toBeVisible();
		await expect(
			page.getByText(/payment element|hosted page/i).first(),
		).toBeVisible();
	});
});
