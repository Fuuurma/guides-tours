// F848 — an armed destructive confirm survived route-param navigation
// and fired against the previous entity. The ConfirmProvider lives at
// the app root, above every route, so a dialog raised on assignment A
// (closing over A's render-time id) stayed armed through the navigation
// to B; confirming it then mutated A. A pathname change now settles the
// pending confirm (and anything queued) as cancelled and closes it.
//
// Pinned through a real memory-history router so the guard is exercised
// the way the app exercises it — a route change, not a prop change.
//
// House style: plain chai assertions (no jest-dom matchers in this repo).

// @vitest-environment jsdom

import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfirmProvider, useConfirm } from "../components/confirm-dialog";

type Settled = "pending" | boolean;
const settled: { last: Settled } = { last: "pending" };

function ArmButton() {
	const confirm = useConfirm();
	return (
		<button
			type="button"
			onClick={() => {
				settled.last = "pending";
				void confirm({
					title: "Delete entity A?",
					variant: "destructive",
				}).then((ok) => {
					settled.last = ok;
				});
			}}
		>
			arm
		</button>
	);
}

function makeRouter() {
	const root = createRootRoute({
		component: () => (
			<ConfirmProvider>
				<Outlet />
			</ConfirmProvider>
		),
	});
	const a = createRoute({
		getParentRoute: () => root,
		path: "/a",
		component: ArmButton,
	});
	const b = createRoute({
		getParentRoute: () => root,
		path: "/b",
		component: () => <p>page b</p>,
	});
	return createRouter({
		routeTree: root.addChildren([a, b]),
		history: createMemoryHistory({ initialEntries: ["/a"] }),
	});
}

describe("ConfirmProvider navigation guard (F848)", () => {
	it("settles an armed confirm as cancelled when the pathname changes", async () => {
		const router = makeRouter();
		render(<RouterProvider router={router} />);

		fireEvent.click(await screen.findByText("arm"));
		await screen.findByText("Delete entity A?");
		expect(settled.last).toBe("pending");

		await act(async () => {
			router.history.push("/b");
		});
		await screen.findByText("page b");

		await waitFor(() => expect(settled.last).toBe(false));
		expect(screen.queryByText("Delete entity A?")).toBe(null);
	});

	it("still resolves true when confirmed on the route it was raised on", async () => {
		const router = makeRouter();
		render(<RouterProvider router={router} />);

		fireEvent.click(await screen.findByText("arm"));
		await screen.findByText("Delete entity A?");
		fireEvent.click(screen.getByText("Delete"));

		await waitFor(() => expect(settled.last).toBe(true));
	});
});
