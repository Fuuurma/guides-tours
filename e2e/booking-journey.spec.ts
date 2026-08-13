import { expect, test } from "@playwright/test";
import { localYmd } from "../src/lib/calendar-date";
import {
	createTourViaUi,
	signIn,
	signUpAndOnboard,
	waitForHydration,
} from "./helpers/auth";

function daysFromToday(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return localYmd(date);
}

async function createSchedule(
	page: import("@playwright/test").Page,
	args: { tourName: string; date: string; start: string; end: string; capacity: string },
): Promise<string> {
	await page.goto("/dashboard/schedules/new");
	await waitForHydration(page);
	await page.locator("#tour").waitFor({ state: "visible", timeout: 30_000 });
	await page.locator("#tour").click();
	await page.getByRole("option", { name: args.tourName }).click();
	await page.locator("#date").fill(args.date);
	await page.locator("#start").fill(args.start);
	await page.locator("#end").fill(args.end);
	await page.locator("#cap").fill(args.capacity);
	await page.getByRole("button", { name: "Create schedule" }).click();
	await page.waitForURL(
		(url) =>
			/^\/dashboard\/schedules\/[^/]+$/.test(url.pathname) &&
			url.pathname !== "/dashboard/schedules/new",
		{ timeout: 60_000 },
	);
	return page.url();
}

test.describe("complete operator booking journey", () => {
	test.setTimeout(240_000);

	test("creates, assigns, confirms, reschedules, and cancels one booking", async ({
		page,
	}) => {
		const session = await signUpAndOnboard(page, { namePrefix: "journey" });
		const tourName = `Journey Tour ${Date.now()}`;
		const firstDate = daysFromToday(14);
		const secondDate = daysFromToday(21);
		const blackoutDate = daysFromToday(28);

		const tourUrl = await createTourViaUi(page, tourName);
		const firstScheduleUrl = await createSchedule(page, {
			tourName,
			date: firstDate,
			start: "10:00",
			end: "12:00",
			capacity: "4",
		});

		// A schedule is the availability surface: verify its capacity and use
		// the linked action to assign the real Better Auth owner identity.
		await expect(page.getByText("Booked / Total").first()).toBeVisible();
		await expect(page.getByText("0 / 4").first()).toBeVisible();
		await page.getByRole("link", { name: "Assign guide" }).click();
		await page.waitForURL(/\/dashboard\/assignments\/new/);
		await waitForHydration(page);
		await expect(page.locator("#tour")).toContainText(tourName, {
			timeout: 30_000,
		});
		await page.locator("#guide").click();
		await page.getByRole("option").first().click();
		await page.getByRole("button", { name: "Create assignment" }).click();
		await page.waitForURL(
			(url) =>
				/^\/dashboard\/assignments\/[^/]+$/.test(url.pathname) &&
				url.pathname !== "/dashboard/assignments/new",
		);
		await expect(page.getByText("E2E Owner").first()).toBeVisible();

		const secondScheduleUrl = await createSchedule(page, {
			tourName,
			date: secondDate,
			start: "14:00",
			end: "16:00",
			capacity: "4",
		});

		// Set a blackout through the operator UI, then verify the public page
		// exposes the same rule before booking an allowed schedule.
		await page.goto(tourUrl);
		await waitForHydration(page);
		await page.getByRole("button", { name: "+ Blackout" }).click();
		await page.locator("#b-start").fill(blackoutDate);
		await page.locator("#b-end").fill(blackoutDate);
		await page.locator("#b-reason").fill("Private event");
		await page.getByRole("button", { name: "Create", exact: true }).click();
		await expect(page.getByText("Blackout created")).toBeVisible();

		await page.context().clearCookies();
		await page.goto(`/book/${session.orgSlug}`);
		await waitForHydration(page);
		await page.locator(`input[type="radio"][id^="tour-"]`).first().check();
		await page.locator("#date").fill(blackoutDate);
		await expect(
			page.getByText(/not available.*blocked bookings/i),
		).toBeVisible({ timeout: 30_000 });

		await page.locator("#date").fill(firstDate);
		await page.locator("#time").waitFor({ state: "visible", timeout: 30_000 });
		const firstTimeOption = page
			.locator("#time option")
			.filter({ hasText: "10:00" })
			.first();
		const firstTimeValue = await firstTimeOption.getAttribute("value");
		expect(firstTimeValue).toBeTruthy();
		await page.locator("#time").selectOption(firstTimeValue ?? "");
		await page.locator("#guests").fill("2");
		await page.locator("#name").fill("Journey Customer");
		await page.locator("#email").fill("journey-customer@example.com");
		await page.locator("#emailConsent").check();
		await page.getByRole("button", { name: "Request booking" }).click();
		await expect(
			page.getByRole("heading", { name: /booking request received/i }),
		).toBeVisible({ timeout: 60_000 });

		await signIn(page, session);
		await page.goto("/dashboard/bookings");
		await waitForHydration(page);
		await expect(page.getByText("Journey Customer").first()).toBeVisible({
			timeout: 30_000,
		});
		await page.getByText("Journey Customer").first().click();
		await page.waitForURL(
			(url) =>
				/^\/dashboard\/bookings\/[^/]+$/.test(url.pathname) &&
				url.pathname !== "/dashboard/bookings/new",
		);
		await waitForHydration(page);
		await expect(
			page.getByRole("button", { name: "Confirm booking" }),
		).toBeVisible();
		await page.getByRole("button", { name: "Confirm booking" }).click();
		await expect(page.getByText(/booking confirmed/i).first()).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByText("Confirmed").first()).toBeVisible();

		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/dashboard\/bookings\/[^/]+\/edit$/);
		await waitForHydration(page);
		await page.locator("#edit-date").fill(secondDate);
		await page.locator("#edit-slot").waitFor({ state: "visible", timeout: 30_000 });
		await page.locator("#edit-slot").click();
		await page.getByRole("option", { name: /14:00/ }).click();
		await page.getByRole("button", { name: "Save changes" }).click();
		await page.waitForURL(
			(url) =>
				/^\/dashboard\/bookings\/[^/]+$/.test(url.pathname) &&
				url.pathname !== "/dashboard/bookings/new",
		);
		await expect(page.getByText(`${secondDate} at 14:00`).first()).toBeVisible({
			timeout: 30_000,
		});

		await page.getByRole("button", { name: "Cancel" }).click();
		await page
			.getByPlaceholder(/reason for cancellation/i)
			.fill("Customer changed plans");
		await page.getByRole("button", { name: "Confirm cancellation" }).click();
		await expect(page.getByText("Cancelled").first()).toBeVisible({
			timeout: 30_000,
		});

		// Cancellation returns the reserved capacity to the target schedule.
		await page.goto(secondScheduleUrl);
		await waitForHydration(page);
		await expect(page.getByText("0 / 4").first()).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByText(/No bookings yet for this schedule/i)).toBeVisible();
		void firstScheduleUrl;
	});
});
