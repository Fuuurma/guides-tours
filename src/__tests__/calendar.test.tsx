// Tests for the dashboard calendar page's action affordances.
//
// 1. Overflow. The cell lists the first 3 assignments and then used to
//    render "+N more" as an inert <span>. That is not cosmetic: the
//    remaining assignments had no path at all. Not for a mouse user (the
//    text does nothing) and not for a keyboard or screen-reader user (a
//    span is not focusable and announces as loose text). The day simply
//    truncated. It is now a real button that lands the operator on that day
//    in the week view, which lists every assignment untruncated.
//
// 2. Gap count. "N gaps" was a <span> too, so the month view reported
//    unstaffed departures with no way to act on them while the week view
//    already had a real Gaps button. It is now a link to /dashboard/staffing
//    scoped to that one day.

// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn(), useOrgMembers: vi.fn() }));

// Every query answers with the same rows. The page asks for assignments,
// schedules and tours through three separate useQuery calls and re-runs
// all of them on each re-render, so keying a fixture to call order silently
// returns the wrong one after the first state change. One fixture for all
// three is immune to that, and each consumer only reads the fields it needs.
vi.mock("@convex-dev/react-query", () => ({ convexQuery: (q: unknown) => q }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/hooks/use-org-members", () => ({
	useOrgMembers: mocks.useOrgMembers,
}));
vi.mock("@tanstack/react-router", () => ({
	// createFileRoute(path)(config) — the route file calls it curried.
	createFileRoute: () => (config: { component: unknown }) => config,
	Link: ({
		children,
		title,
		className,
		to,
		search,
	}: {
		children?: unknown;
		title?: string;
		className?: string;
		to?: unknown;
		search?: unknown;
	}) => (
		// `to` and `search` are surfaced as data attributes so a test can
		// assert where a link actually points — a stub href of "#" would
		// otherwise make every routing claim untestable.
		<a
			// biome-ignore lint/a11y/useValidAnchor: stand-in for TanStack's Link, which renders a real routed anchor; nothing navigates in this test.
			href="#"
			title={title}
			className={className}
			data-to={String(to)}
			data-search={JSON.stringify(search ?? null)}
		>
			{children as never}
		</a>
	),
}));

const { CalendarPage } = await import("../routes/dashboard/calendar");

/** A Friday inside the month the frozen cursor opens on. */
const BUSY_DATE = "2026-08-14";

/**
 * Assignment rows that also satisfy the tour and schedule readers.
 * `tourType: "car"` is deliberate in the gap cases: it makes the tour
 * require a vehicle and a driver, and a slot with no guide, vehicle or
 * driver assigned is then an unstaffed departure.
 */
function rowsOn(date: string, count: number, tourType = "walking") {
	return Array.from({ length: count }, (_, i) => ({
		// Row 0 doubles as the tour record: the gap calculation looks the
		// tour up by `tourId` in the map built from these same rows, so a
		// tourId nothing matches silently yields zero gaps.
		_id: i === 0 ? "tour_1" : `a_${i}`,
		tourId: "tour_1",
		guideId: "guide_1",
		date,
		// 09:00, 09:30, 10:00, 10:30, 11:00 — real zero-padded times. The
		// grid sorts by this string, so a malformed value would silently
		// reorder the day and change which three the month cell shows.
		startTime: `${String(9 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
		status: "confirmed",
		// read by the tour-name map and by resolveTourStaffing
		name: "Old Town Walk",
		tourType,
	}));
}

/**
 * The inactive TabsContent panel stays mounted and — because jsdom never
 * loads the stylesheet that hides it — is still exposed to role queries. So
 * a document-wide search for an assignment chip matches the WEEK panel's copy
 * and passes while the month grid is still hiding it. Radix wires the trigger
 * to its panel with aria-controls, so scope to the panel we mean.
 */
function panelFor(name: RegExp) {
	const id = screen.getByRole("tab", { name }).getAttribute("aria-controls");
	const el = id ? document.getElementById(id) : null;
	if (!el) throw new Error(`no panel for tab ${name}`);
	return within(el);
}

function renderWith(count: number, tourType?: string) {
	mocks.useQuery.mockReturnValue({
		data: rowsOn(BUSY_DATE, count, tourType),
		isPending: false,
	});
	render(<CalendarPage />);
	// Radix Tabs activate on mousedown, not click.
	fireEvent.mouseDown(screen.getByRole("tab", { name: /month/i }));
}

beforeEach(() => {
	// Pin "now" so the rendered month is deterministic and BUSY_DATE is
	// unambiguously inside it.
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-08-10T09:00:00Z"));
	mocks.useOrgMembers.mockReturnValue({
		members: [],
		displayName: (id: string) => `Guide ${id}`,
	});
});

afterEach(() => {
	vi.useRealTimers();
	mocks.useQuery.mockReset();
	mocks.useOrgMembers.mockReset();
});

describe("dashboard calendar — month grid overflow control", () => {
	it("exposes a real button, not inert text, when a day overflows", () => {
		renderWith(5);

		// Looking the control up BY ROLE is the assertion: a <span> carries
		// no role at all, so this query cannot match dead text.
		const overflow = screen.getByRole("button", { name: /\+\s*2\s*more/i });
		expect(overflow.tagName).toBe("BUTTON");
		expect(overflow.textContent).toMatch(/show all 5/i);
	});

	it("reveals every assignment for that day when the control is activated", () => {
		renderWith(5);

		// Establish the truncation first: the month cell only ever renders
		// the first 3 chips, so the 4th and 5th are genuinely unreachable
		// before the control is used.
		const month = panelFor(/month/i);
		expect(month.queryAllByRole("link", { name: /10:30/ })).toHaveLength(0);
		expect(month.queryAllByRole("link", { name: /11:00/ })).toHaveLength(0);

		fireEvent.click(month.getByRole("button", { name: /\+\s*2\s*more/i }));

		// The control moved the page to that day in the week view, where
		// every assignment is listed.
		expect(screen.getByRole("tab", { name: /week/i })).toHaveProperty(
			"ariaSelected",
			"true",
		);
		const week = panelFor(/week/i);
		expect(week.getAllByRole("link", { name: /10:30/ }).length).toBeGreaterThan(
			0,
		);
		expect(week.getAllByRole("link", { name: /11:00/ }).length).toBeGreaterThan(
			0,
		);
		// ...anchored on the day that was clicked, not merely the week.
		expect(week.getByText("Fri, Aug 14")).toBeTruthy();
	});

	it("renders no overflow control on a day that fits", () => {
		renderWith(2);

		expect(screen.queryByRole("button", { name: /more/i })).toBeNull();
	});
});

describe("dashboard calendar — month grid gap count", () => {
	it("is a real link to staffing, not dead text", () => {
		// "car" + no guide/vehicle/driver on the slot = an unstaffed
		// departure, which is what drives the gap count.
		renderWith(2, "car");

		const month = panelFor(/month/i);
		const gapLink = month.getByRole("link", { name: /gaps?/i });
		expect(gapLink.tagName).toBe("A");
		expect(gapLink).toHaveProperty("href");
	});

	it("scopes the staffing link to that one day", () => {
		renderWith(2, "car");

		const month = panelFor(/month/i);
		const gapLink = month.getByRole("link", { name: /gaps?/i });
		expect(gapLink.getAttribute("data-to")).toBe("/dashboard/staffing");
		// /dashboard/staffing validates from/to, so the link can name the
		// day rather than dumping the operator on an unscoped page.
		expect(JSON.parse(gapLink.getAttribute("data-search") ?? "null")).toEqual({
			from: BUSY_DATE,
			to: BUSY_DATE,
		});
	});

	it("renders no gap indicator on a day with no gaps", () => {
		// "walking" with a guide assigned is fully staffed.
		renderWith(2, "walking");

		const month = panelFor(/month/i);
		expect(month.queryByRole("link", { name: /gaps?/i })).toBeNull();
	});
});

describe("dashboard calendar — week agenda actions", () => {
	/** The week view is the default, so no tab switch is needed here. */
	function renderWeek(count: number, tourType: string) {
		mocks.useQuery.mockReturnValue({
			data: rowsOn(BUSY_DATE, count, tourType),
			isPending: false,
		});
		render(<CalendarPage />);
		return panelFor(/week/i);
	}

	/** The header "+ Assign" only. The empty state calls the same link
	 *  "Assign guide", so the two are told apart by name, not by target. */
	const headerAssign = (scope: ReturnType<typeof panelFor>) =>
		scope.queryAllByRole("link", { name: /\+\s*assign/i });

	it("drops the header + Assign on an empty day, keeping the empty state's", () => {
		// 0 rows makes all 7 days of the week empty — the worst case, where
		// every card used to render both a header "+ Assign" and an empty
		// state "Assign guide" pointing at the identical route and date.
		const week = renderWeek(0, "car");

		expect(headerAssign(week)).toHaveLength(0);
		// The action itself survives, once per empty day.
		expect(
			week.queryAllByRole("link", { name: /^assign guide$/i }),
		).toHaveLength(7);
	});

	it("keeps the day-level actions an empty day still needs", () => {
		const week = renderWeek(0, "car");

		// Removing the duplicate must not remove the day's other action.
		const targets = week
			.queryAllByRole("link")
			.map((l) => l.getAttribute("data-to"));
		expect(
			targets.filter((t) => t === "/dashboard/schedules/new"),
		).toHaveLength(7);
		// No Gaps button here, and that is correct rather than a regression:
		// a gap is an unstaffed *departure*, and a day with no departures has
		// none. So the empty state and the Gaps button never co-occur, which
		// is why the only duplication on an empty day was the assign pair.
		expect(targets.filter((t) => t === "/dashboard/staffing")).toHaveLength(0);
	});

	it("still offers Gaps on a day that has unstaffed departures", () => {
		// "car" tours with no vehicle or driver assigned are gaps, and these
		// rows are also assignments — so this is a day with content, which is
		// exactly where the header buttons must both survive.
		const week = renderWeek(2, "car");

		const targets = week
			.queryAllByRole("link")
			.map((l) => l.getAttribute("data-to"));
		expect(targets.filter((t) => t === "/dashboard/staffing")).toHaveLength(1);
		expect(headerAssign(week)).toHaveLength(1);
	});

	it("keeps the header + Assign on a day that has assignments", () => {
		// 4 rows, all on BUSY_DATE, so exactly one of the 7 days is busy.
		const week = renderWeek(4, "walking");

		expect(headerAssign(week)).toHaveLength(1);
		// ...and the other six days still get their empty-state action.
		expect(
			week.queryAllByRole("link", { name: /^assign guide$/i }),
		).toHaveLength(6);
	});
});
