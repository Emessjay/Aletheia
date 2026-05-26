// Global test setup. Loads @testing-library/jest-dom matchers
// (toBeInTheDocument etc.) and runs `cleanup()` after each test so DOM
// roots from previous renders don't leak across cases — without this,
// `getByTestId` sees nodes from earlier tests and fails ambiguously.

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
