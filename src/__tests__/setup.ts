// Vitest setup — runs before every test in the project.
//
// Wires up @testing-library/react's automatic cleanup so component
// tests don't have to call cleanup() themselves between tests.
// Without this, the DOM from previous tests leaks into the next
// test (multiple elements with the same data-testid appear).

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
	cleanup();
});
