// Tests for useTodayYmd — rendering-hydration-mismatch-time pin.
//
// <input type="date"> min= used to read `new Date().toISOString()`
// inline in JSX: UTC, so guests behind UTC lost "today" near midnight,
// and a render-time clock read lets SSR markup disagree with the
// client's first render. The hook emits undefined until after mount
// (the F114 upgrade-after-mount pattern), then stamps the browser's
// local calendar day via localYmd().

// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useTodayYmd } from "@/hooks/use-today-ymd";
import { localYmd } from "@/lib/calendar-date";

function Probe() {
	const today = useTodayYmd();
	return <input type="date" min={today} data-testid="date" />;
}

describe("useTodayYmd", () => {
	it("renders no min during SSR (first render is environment-independent)", () => {
		const html = renderToString(<Probe />);
		expect(html).not.toContain('min="');
	});

	it("sets min to the browser's local calendar day after mount", async () => {
		render(<Probe />);
		const input = screen.getByTestId("date");
		await waitFor(() => {
			expect(input.getAttribute("min")).toBe(localYmd());
		});
	});
});
