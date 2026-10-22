// F756 regression pin: the notification forms' submit-time error clears.
//
// The notification split moved each form's submit path into a hook
// (notification-settings-form.ts / notification-template-form.ts) and
// handed the error state back to the page through a callback. The
// callbacks were typed `(message: string) => void`, so the split could
// only ever SET an error — the pre-split code's `setSubmitErr(null)` /
// `setSaveErr(null)` / `setTestErr(null)` as the first statement of each
// onSubmit had no way to survive the move. The stale failure banner
// therefore never cleared after a successful retry.
//
// The fix widens the three callbacks to `(message: string | null) => void`
// and restores the clear as the first statement of each onSubmit, exactly
// as the pre-split code had it.
//
// These pins drive the real page and the real route so the whole seam is
// covered: submit fails -> the ErrorBanner shows -> submit succeeds ->
// the ErrorBanner is gone, and the component was never unmounted (the
// same DOM node persists across the retry).

// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	useQuery: vi.fn(),
	upsert: vi.fn(),
	sendTest: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}));

// Radix's Switch/ToggleGroup measure through ResizeObserver; jsdom has none.
class ResizeObserverStub {
	observe() {
		/* jsdom stub — no-op */
	}
	unobserve() {
		/* jsdom stub — no-op */
	}
	disconnect() {
		/* jsdom stub — no-op */
	}
}
beforeAll(() => {
	window.ResizeObserver =
		ResizeObserverStub as unknown as typeof ResizeObserver;
	window.HTMLElement.prototype.scrollIntoView = () => {
		/* jsdom stub — no-op */
	};
	window.HTMLElement.prototype.hasPointerCapture = () => false;
	window.HTMLElement.prototype.releasePointerCapture = () => {
		/* jsdom stub — no-op */
	};
});

// The two forms under test reach Convex through three entry points. The
// query mocks route by ARGS SHAPE, not by query-reference identity: the
// generated api module loads as TWO instances under vitest (same resolved
// file, dual module graph), so `options.ref === api.x.y` never matches.
vi.mock("@tanstack/react-query", () => ({
	useQuery: mocks.useQuery,
}));

vi.mock("@convex-dev/react-query", () => ({
	convexQuery: (ref: unknown, args: unknown) => ({ ref, args }),
}));

vi.mock("convex/react", async () => {
	const { getFunctionName } = await import("convex/server");
	return {
		useMutation: (ref: unknown) => {
			// Route by FUNCTION NAME, not by reference identity: the
			// generated api module loads as TWO instances under vitest
			// (same resolved file, dual module graph), so
			// `ref === api.x.y` never matches.
			const name = getFunctionName(ref as never);
			if (name.includes("sendTest")) return mocks.sendTest;
			return mocks.upsert;
		},
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: unknown }) => opts,
	Link: ({
		children,
		to,
		params: _params,
		...rest
	}: {
		children: React.ReactNode;
		to: string;
		params?: unknown;
	}) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
}));

vi.mock("sonner", () => ({
	toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { NotificationSettingsPage } from "../components/pages/notification-settings-page";
import { useTemplateTestForm } from "../components/pages/notification-template-form";
import { TemplateTestFields } from "../components/pages/notification-template-sections";

/**
 * The "Send test" card as the route wires it: the page owns the error
 * state, the hook owns the submit path, and the card renders the banner.
 * This is the route's own composition (src/routes/dashboard/notifications/
 * $templateId.tsx), extracted so the card can be driven without the whole
 * detail route's query/mutation surface.
 */
function TemplateTestCard() {
	const [testErr, setTestErr] = useState<string | null>(null);
	const form = useTemplateTestForm({
		template: {
			_id: "tpl-1",
			name: "Booking confirmed",
			templateType: "booking_confirmation",
			channel: "email",
			isActive: true,
			isDefault: false,
			emailSubject: "Your booking",
			emailBodyText: "Thanks for booking",
			emailBodyHtml: "",
			smsBody: "",
			variables: [],
			sendTiming: "immediate",
			requireConsent: false,
			retryOnFailure: false,
			retryCount: 3,
			createdAt: 0,
			updatedAt: 0,
		} as never,
		sendTest: (args) => mocks.sendTest(args),
		onTestError: setTestErr,
	});
	return <TemplateTestFields form={form} testErr={testErr} />;
}

const SETTINGS = {
	_id: "s-1",
	organizationId: "org-1",
	twilioEnabled: false,
	twilioAccountSid: "",
	twilioPhoneNumber: "",
	emailEnabled: true,
	emailFromName: "Acme Tours",
	emailFromEmail: "bookings@acme.test",
	useCompanyDefaults: false,
	requireSmsConsent: false,
	requireEmailConsent: false,
	maxRetries: 3,
	retryDelayMinutes: 15,
	staffingDigestEnabled: false,
	staffingDigestEmail: "",
	staffingDigestPhone: "",
	staffingDigestDaysAhead: 3,
	availabilityReminderEnabled: false,
	availabilityReminderDaysAhead: 7,
	assignmentNotifyEnabled: true,
	phoneRemindWithDigest: false,
};

/** jsdom does not synthesize submit events from submit-button clicks —
 * drive the form's submit directly, cancelably. */
function submitForm(form: HTMLFormElement) {
	form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

beforeEach(() => {
	mocks.useQuery.mockReset();
	mocks.upsert.mockReset();
	mocks.sendTest.mockReset();
	mocks.toastSuccess.mockReset();
	mocks.toastError.mockReset();
	mocks.useQuery.mockReturnValue({ data: SETTINGS, isPending: false });
});

describe("notification settings form error clear (F756)", () => {
	it("clears the stale error banner after a successful retry", async () => {
		// First attempt fails at the backend.
		mocks.upsert.mockRejectedValueOnce(new Error("Upstream is down"));
		const { container } = render(<NotificationSettingsPage />);

		const form = container.querySelector("form") as HTMLFormElement;
		expect(form).not.toBeNull();
		submitForm(form);

		// The failure surfaces in the banner.
		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeTruthy();
			expect(screen.getByText("Upstream is down")).toBeTruthy();
		});

		// A stable node from the first render — proving the page was never
		// unmounted when the banner cleared.
		const heading = screen.getByRole("heading", {
			name: "Notification settings",
		});

		// Second attempt succeeds.
		mocks.upsert.mockResolvedValueOnce({});
		submitForm(form);

		await waitFor(() => {
			expect(screen.queryByRole("alert")).toBeNull();
		});
		expect(screen.queryByText("Upstream is down")).toBeNull();
		// Same DOM node: the banner cleared in place, no remount.
		expect(screen.getByRole("heading", { name: "Notification settings" })).toBe(
			heading,
		);
	});
});

describe("notification template test card error clear (F756)", () => {
	it("clears the stale error banner after a successful retry", async () => {
		mocks.sendTest.mockRejectedValueOnce(new Error("SES is unreachable"));
		const { container } = render(<TemplateTestCard />);

		const form = container.querySelector("form") as HTMLFormElement;
		expect(form).not.toBeNull();
		// The test send needs a valid destination.
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "ops@acme.test" },
		});
		submitForm(form);

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeTruthy();
			expect(screen.getByText("SES is unreachable")).toBeTruthy();
		});

		const input = screen.getByLabelText("Email");

		mocks.sendTest.mockResolvedValueOnce({});
		submitForm(form);

		await waitFor(() => {
			expect(screen.queryByRole("alert")).toBeNull();
		});
		expect(screen.queryByText("SES is unreachable")).toBeNull();
		// Same DOM node: the card was never unmounted.
		expect(screen.getByLabelText("Email")).toBe(input);
	});
});
