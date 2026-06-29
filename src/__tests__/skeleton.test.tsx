// Tests for the Skeleton UI primitive.
//
// Skeleton is a styled <div> with the standard `animate-pulse` + muted
// background. Tests pin the data-slot attribute and the className
// pass-through so future refactors don't silently break Tailwind
// theming or the data-slot convention.

// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Skeleton } from "../components/ui/skeleton";

describe("Skeleton", () => {
	test("renders a div with the skeleton data-slot", () => {
		render(<Skeleton data-testid="skel" />);
		const el = screen.getByTestId("skel");
		expect(el.tagName).toBe("DIV");
		expect(el.getAttribute("data-slot")).toBe("skeleton");
	});

	test("default className includes pulse animation + muted background", () => {
		render(<Skeleton data-testid="skel" />);
		const el = screen.getByTestId("skel");
		expect(el.className).toContain("animate-pulse");
		expect(el.className).toContain("bg-muted");
		expect(el.className).toContain("rounded-md");
	});

	test("appends caller-supplied className", () => {
		render(<Skeleton data-testid="skel" className="h-8 w-1/2" />);
		const el = screen.getByTestId("skel");
		expect(el.className).toContain("h-8");
		expect(el.className).toContain("w-1/2");
	});

	test("forwards arbitrary HTML attributes", () => {
		render(<Skeleton data-testid="skel" aria-label="loading" />);
		const el = screen.getByTestId("skel");
		expect(el.getAttribute("aria-label")).toBe("loading");
	});
});
