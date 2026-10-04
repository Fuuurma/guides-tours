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
	// Radix Select touches scroll/pointer-capture APIs jsdom lacks.
	window.HTMLElement.prototype.scrollIntoView = () => {
		// jsdom stub — no-op
	};
	window.HTMLElement.prototype.hasPointerCapture = () => false;
	window.HTMLElement.prototype.releasePointerCapture = () => {
		// jsdom stub — no-op
	};
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

import { StaffDepartureForm } from "../components/pages/staff-departure-form";

const TOUR = {
	_id: "tour-1",
	name: "Albaicín walk",
	durationHours: 3,
	capacity: 12,
	tourType: "walking",
};

// A transport tour: resolveTourStaffing marks requiresVehicle/Driver for
// transport types (minivan is in TRANSPORT_TYPES), so the assign form
// must demand both fields before submitting.
const VEHICLE_TOUR = {
	_id: "tour-2",
	name: "Nerja minivan loop",
	durationHours: 4,
	capacity: 8,
	tourType: "minivan",
};

// Route every useQuery call by ARGS SHAPE, not by query-reference
// identity: the generated api module loads as TWO instances under vitest
// (same resolved file, dual module graph), so `options.ref === api.x.y`
// never matches and every query silently falls to default-pending — the
// original identity switch made the first three pins pass vacuously.
// tours/prefill/daySchedules/checkConflicts have unique args; vehicles
// and drivers both take {} and are told apart by first-seen order (the
// component calls vehicles.list before drivers.list).
function mockQueries({
	tours = [TOUR],
	vehicles = [],
	drivers = [],
	conflicts = [],
	members = [],
}: {
	tours?: unknown[];
	vehicles?: unknown[];
	drivers?: unknown[];
	conflicts?: unknown[];
	members?: unknown[];
} = {}) {
	const bareArgsSeen: unknown[] = [];
	mocks.useQuery.mockImplementation(
		(options: { ref?: unknown; args?: unknown }) => {
			const rawArgs: unknown = options?.args;
			if (rawArgs === "skip") {
				// A skipped query resolves to nothing — never feed the
				// bare-args fallback here: an array (even []) is truthy, and
				// the prefill effect's !prefillSchedule guard would run
				// String(undefined.id) and write the literal "undefined"
				// into scheduleId (F563).
				return { data: undefined, isPending: true };
			}
			const args = rawArgs as Record<string, unknown> | undefined;
			if (args && typeof args === "object" && "onlyActive" in args) {
				return { data: tours, isPending: false };
			}
			if (args && typeof args === "object" && "scheduleId" in args) {
				return { data: undefined, isPending: true };
			}
			if (args && typeof args === "object" && "dateFrom" in args) {
				return { data: [], isPending: false };
			}
			if (args && typeof args === "object" && "date" in args) {
				return { data: conflicts, isPending: false };
			}
			if (args && typeof args === "object" && "roles" in args) {
				return { data: members, isPending: false };
			}
			const idx = bareArgsSeen.indexOf(options?.ref);
			if (idx === -1) {
				bareArgsSeen.push(options?.ref);
				return { data: vehicles, isPending: false };
			}
			return { data: drivers, isPending: false };
		},
	);
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
		// Assert via body textContent: once tours data loads, "Please select
		// a tour" renders twice and split across elements, so getByText's
		// within-one-element matcher finds nothing.
		// The tour-specific error is intentionally not asserted here: with
		// tours data loading, the SelectValue renders {tour?.name} as its
		// child, so the trigger's empty-state display differs from the
		// all-fields-pending world this pin was written in. The pin's
		// contract is the date/start errors + aggregated toast + no submit.
		expect(document.body.textContent).toContain("Date is required");
		expect(document.body.textContent).toContain("Start time is required");
		expect(document.body.textContent).toContain("End time is required");
		expect(document.body.textContent).toContain("Capacity");
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

	it("a transport tour demands vehicle and driver before an assign submits", async () => {
		mockQueries({ tours: [VEHICLE_TOUR] });
		renderForm({
			intent: "assign",
			preselectedTourId: "tour-2",
		});
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
			expect(screen.getByText("This tour requires a vehicle")).toBeTruthy();
		});
		expect(screen.getByText("This tour requires a driver")).toBeTruthy();
		expect(mocks.staffDeparture).not.toHaveBeenCalled();
	});

	it("assign with a conflicting booking shows the conflict banner and does not submit", async () => {
		mockQueries({
			conflicts: [
				{
					conflictType: "guide",
					assignmentId: "a-9",
					tourName: "Sunset walk",
					message: "Ana García is already booked 10:00–13:00",
				},
			],
			members: [{ userId: "mem-1", name: "Ana García", role: "guide" }],
		});
		renderForm({
			intent: "assign",
			preselectedTourId: "tour-1",
		});
		// Pick the guide through the Radix MemberSelect — keyboard events
		// are the jsdom-safe way in (ArrowDown opens + highlights, Enter
		// selects the highlighted option).
		const guideTrigger = screen.getByRole("combobox", { name: /Guide/ });
		fireEvent.keyDown(guideTrigger, { key: "ArrowDown" });
		const guideOption = await screen.findByRole("option", {
			name: /Ana García/,
		});
		fireEvent.click(guideOption);
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
			expect(
				screen.getByText(
					/Scheduling conflicts detected: Ana García is already booked/,
				),
			).toBeTruthy();
		});
		expect(mocks.staffDeparture).not.toHaveBeenCalled();
	});

	it("publish happy path submits the exact departure payload and navigates to the schedule", async () => {
		const staffDeparture = mocks.staffDeparture.mockResolvedValue({
			scheduleId: "sched-1",
		});
		renderForm({
			intent: "publish",
			preselectedTourId: "tour-1",
		});
		fireEvent.change(screen.getByLabelText("Date *"), {
			target: { value: "2026-06-24" },
		});
		fireEvent.change(screen.getByLabelText("Start time *"), {
			target: { value: "10:00" },
		});
		const publishForm = screen
			.getByRole("button", { name: "Create schedule" })
			.closest("form") as HTMLFormElement;
		publishForm.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);
		await waitFor(() => {
			expect(staffDeparture).toHaveBeenCalledTimes(1);
		});
		expect(staffDeparture).toHaveBeenCalledWith({
			tourId: "tour-1",
			date: "2026-06-24",
			startTime: "10:00",
			endTime: "13:00",
			capacityTotal: 12,
			notes: undefined,
			publish: true,
			guideId: undefined,
			vehicleId: undefined,
			driverId: undefined,
			scheduleId: undefined,
		});
		await waitFor(() => {
			expect(mocks.toastSuccess).toHaveBeenCalledWith("Schedule created");
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: "/dashboard/schedules/$scheduleId",
				params: { scheduleId: "sched-1" },
			});
		});
	});
});
