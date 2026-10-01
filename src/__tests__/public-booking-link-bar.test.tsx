// Tests for PublicBookingLinkBar — F114 regression pin.
//
// The bar used to compute its URL behind a `typeof window` check, so
// SSR printed an empty input with a disabled Copy button. The first
// patch kept the environment fork (relative on the server, absolute on
// the client), which is a hydration mismatch if the bar ever SSRs with
// org data. First render must now be identical on both sides — a real
// relative path — upgrading to the absolute URL only after mount.

// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}));

// Link needs a live router context; the bar's routing is irrelevant here.
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		params: _params,
		...rest
	}: {
		children: ReactNode;
		to: string;
		params: Record<string, string>;
	}) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
}));

vi.mock("sonner", () => ({
	toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { PublicBookingLinkBar } from "../components/public-booking-link-bar";

describe("PublicBookingLinkBar", () => {
	it("SSR markup shows a real URL with Copy enabled", () => {
		const html = renderToString(<PublicBookingLinkBar slug="acme-tours" />);
		expect(html).toContain('value="/book/acme-tours"');
		expect(html).not.toContain('disabled=""');
	});

	it("first render is environment-independent (no hydration fork)", () => {
		// jsdom defines window — renderToString still must not read it, so
		// server and client emit identical markup.
		const html = renderToString(<PublicBookingLinkBar slug="acme-tours" />);
		expect(html).toContain('value="/book/acme-tours"');
		expect(html).not.toContain(window.location.origin);
	});

	it("upgrades the input to the absolute URL after mount", async () => {
		render(<PublicBookingLinkBar slug="acme-tours" />);
		const input = await screen.findByLabelText("Direct booking URL");
		await waitFor(() =>
			expect(input).toHaveProperty(
				"value",
				`${window.location.origin}/book/acme-tours`,
			),
		);
	});

	it("copies the absolute URL to the clipboard", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText },
			configurable: true,
		});
		render(<PublicBookingLinkBar slug="acme-tours" />);
		fireEvent.click(screen.getByRole("button", { name: "Copy" }));
		await waitFor(() =>
			expect(writeText).toHaveBeenCalledWith(
				`${window.location.origin}/book/acme-tours`,
			),
		);
	});
});
