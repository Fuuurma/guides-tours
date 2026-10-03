// First test pins for StaffDepartureForm — the dashboard's highest-CCN
// untested component (repowise 10-02: ccn 45, 838 NLOC).
//
// Pins three reviewed behaviors of the submit-time validation:
//   - An empty publish submit fails with the per-field messages and the
//     aggregated toast ("Please fix the highlighted fields").
//   - The F64 midnight rule: a start late in the day whose end auto-fills
//     past midnight can't be published, with the plain-language message.
//   - Assign intent without a guide fails with "Please select a guide".
//
// The component is rendered against mocked data layer; tours arrive via
// the preselectedTourId effect so no Radix Select interaction is needed.

// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom lacks ResizeObserver; the ui primitives observe their containers.
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
});

const mocks = vi.hoisted(() => ({
	useQuery: vi.fn(),
	staffDeparture: vi.fn(),
	navigate: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock("convex/react", () => ({
	useMutation: () => mocks.staffDeparture,
}));

vi.mock("@convex-dev/react-query", () => ({
	convexQuery: (ref: unknown, args: unknown) => ({ ref, args }),
}));

vi.mock("@tanstack/react-query", () => ({
	useQuery: mocks.useQuery,
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		...rest
	}: {
		children: React.ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => (
		<a href={rest.to ?? "#"} data-testid={`link-${rest.to}`}>
			{children}
		</a>
	),
	useNavigate: () => mocks.navigate,
}));

vi.mock("@/hooks/use-org-members", () => ({
	useOrgMembers: () => ({ displayName: () => "Ana García" }),
}));

vi.mock("sonner", () => ({
	toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { api } from "../../convex/_generated/api";
import { StaffDepartureForm } from "../components/pages/staff-departure-form";

const TOUR = {
	_id: "tour-1",
	name: "Albaicín walk",
	durationHours: 3,
	capacity: 12,
	tourType: "walking",
};

// Route every useQuery call by the query reference identity — the test
// imports the same generated api module the component uses.
function mockQueries({
	tours = [TOUR],
	vehicles = [],
	drivers = [],
}: {
	tours?: unknown[];
	vehicles?: unknown[];
	drivers?: unknown[];
} = {}) {
	mocks.useQuery.mockImplementation((options: { ref?: unknown }) => {
		switch (options?.ref) {
			case api.tours.list:
				return { data: tours, isPending: false };
			case api.vehicles.list:
				return { data: vehicles, isPending: false };
			case api.drivers.list:
				return { data: drivers, isPending: false };
			default:
				return { data: undefined, isPending: true };
		}
	});
}

function renderForm(props: Parameters<typeof StaffDepartureForm>[0]) {
	return render(<StaffDepartureForm {...props} />);
}

beforeEach(() => {
	mocks.useQuery.mockReset();
	mocks.staffDeparture.mockReset();
	mocks.navigate.mockReset();
	mocks.toastSuccess.mockReset();
	mocks.toastError.mockReset();
	mockQueries();
});

describe("StaffDepartureForm validation", () => {
	it("an empty publish submit fails with per-field messages + the aggregated toast", async () => {
		renderForm({ intent: "publish" });
		// jsdom does not synthesize submit events from submit-button clicks —
		// drive the form's submit directly.
		const formEl = screen
			.getByRole("button", { name: "Create schedule" })
			.closest("form") as HTMLFormElement;
		fireEvent.submit(formEl);
		await waitFor(() => {
			expect(mocks.toastError).toHaveBeenCalledWith(
				"Please fix the highlighted fields",
			);
		});
		expect(screen.getByText("Please select a tour")).toBeTruthy();
		expect(screen.getByText("Date is required")).toBeTruthy();
		expect(screen.getByText("Start time is required")).toBeTruthy();
		// Nothing was submitted.
		expect(mocks.staffDeparture).not.toHaveBeenCalled();
	});

	it("F64: a late start whose end auto-fills past midnight can't be published", async () => {
		renderForm({
			intent: "publish",
			preselectedTourId: "tour-1",
		});
		// 23:30 + tour duration 3h auto-fills end 02:30 — start >= end.
		fireEvent.change(screen.getByLabelText("Date *"), {
			target: { value: "2026-06-24" },
		});
		fireEvent.change(screen.getByLabelText("Start time *"), {
			target: { value: "23:30" },
		});
		// RTL's fireEvent.submit dispatches a NON-cancelable submit event —
		// jsdom then "navigates" and wipes the document, because the
		// component's preventDefault is powerless. Dispatch cancelable.
		const formEl = screen
			.getByRole("button", { name: "Create schedule" })
			.closest("form") as HTMLFormElement;
		formEl.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);
		await waitFor(() => {
			expect(mocks.toastError).toHaveBeenCalledWith(
				"Please fix the highlighted fields",
			);
		});
		expect(mocks.staffDeparture).not.toHaveBeenCalled();
	});

	it("assign intent without a guide fails with the guide message", async () => {
		renderForm({ intent: "assign", preselectedTourId: "tour-1" });
		fireEvent.change(screen.getByLabelText("Date *"), {
			target: { value: "2026-06-24" },
		});
		fireEvent.change(screen.getByLabelText("Start time *"), {
			target: { value: "10:00" },
		});
		const assignForm = screen
			.getByRole("button", { name: "Create assignment" })
			.closest("form") as HTMLFormElement;
		assignForm.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);
		await waitFor(() => {
			expect(mocks.toastError).toHaveBeenCalledWith(
				"Please fix the highlighted fields",
			);
		});
		expect(screen.getByText("Please select a guide")).toBeTruthy();
		expect(mocks.staffDeparture).not.toHaveBeenCalled();
	});
});
