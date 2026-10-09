// Tests for the dashboard index error surfaces (F706).
//
// Pins that the two raw-error paths — the firstError banner and the
// phone-reminders failure toast — run through getSafeDisplayMessage.
// A network drop must render the generic fallback, never the engine
// text ("Failed to fetch") the queries throw.

// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FALLBACK = "Something went wrong. Please try again.";
const ENGINE_ERROR = new Error("Failed to fetch");

const mocks = vi.hoisted(() => ({
	useQuery: vi.fn(),
	sendReminders: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-query")>()),
	useQuery: mocks.useQuery,
}));

vi.mock("convex/react", () => ({
	useMutation: () => mocks.sendReminders,
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: unknown }) => opts,
	Link: ({
		to,
		params: _params,
		children,
		...rest
	}: {
		to: string;
		params?: unknown;
		children?: React.ReactNode;
	}) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
}));

vi.mock("@/hooks/use-org-members", () => ({
	useOrgMembers: () => ({ displayName: () => "Ana" }),
}));

vi.mock("sonner", () => ({
	toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { Route } from "../routes/dashboard/index";

// The router mock replaces createFileRoute with an identity over the
// options object, so Route IS the options object carrying `component`.
// Under typecheck (no vitest mock) Route is the real Route class — the
// unknown hop documents the test-only shape.
const Dashboard = (Route as unknown as { component: React.ComponentType })
	.component;

const MISSING_PHONES = [
	{
		userId: "u1",
		name: "Pere",
		roles: ["guide"],
		assignmentCount: 2,
	},
];

function stubQueries({
	errorPaths = [],
	missingPhones = [],
}: { errorPaths?: string[]; missingPhones?: unknown[] } = {}) {
	mocks.useQuery.mockImplementation((opts: { queryKey?: unknown[] }) => {
		const path = String(opts.queryKey?.[1] ?? "");
		if (errorPaths.includes(path)) {
			return { data: undefined, isPending: false, error: ENGINE_ERROR };
		}
		if (path === "userProfiles:missingStaffPhones") {
			return { data: missingPhones, isPending: false, error: null };
		}
		if (path === "tours:list") {
			// One active tour keeps isFirstRun false so the missing-phones
			// card (and its Remind all button) renders.
			return {
				data: [{ _id: "t1", name: "Gothic quarter", isActive: true }],
				isPending: false,
				error: null,
			};
		}
		return { data: undefined, isPending: false, error: null };
	});
}

beforeEach(() => {
	mocks.sendReminders.mockReset();
	mocks.toastSuccess.mockReset();
	mocks.toastError.mockReset();
});

describe("dashboard index error surfaces (F706)", () => {
	it("banner renders the safe fallback, not the engine message", () => {
		stubQueries({ errorPaths: ["bookings:list"] });

		render(<Dashboard />);

		const banner = screen.getByText(/Some data failed to load/);
		expect(banner.textContent).toContain(FALLBACK);
		expect(banner.textContent).not.toContain("Failed to fetch");
	});

	it("reminders toast renders the safe fallback, not the engine message", async () => {
		stubQueries({ missingPhones: MISSING_PHONES });
		mocks.sendReminders.mockRejectedValue(ENGINE_ERROR);

		render(<Dashboard />);
		fireEvent.click(screen.getByRole("button", { name: "Remind all" }));

		await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
		expect(mocks.toastError).toHaveBeenCalledWith(FALLBACK);
		expect(mocks.toastError).not.toHaveBeenCalledWith("Failed to fetch");
	});
});
