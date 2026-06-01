/**
 * BugReportRoute renders a sign-in CTA when anonymous and the report form
 * when authenticated. Field-level validation blocks an empty description
 * before any network/adapter call is made.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Stub useAuth — flip status per test.
let authStatus: "anonymous" | "authenticated" = "anonymous";
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    status: authStatus,
    session: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}));

// Stub the platform so a stray submit can't reach the network. The empty-
// description test asserts this is never called.
const createBugReport = vi.fn();
vi.mock("@/platform", () => ({
  getPlatform: () => ({
    userData: { bugReports: { create: createBugReport } },
    info: { isDesktop: false },
  }),
}));

import { BugReportRoute } from "./BugReportRoute";

describe("BugReportRoute", () => {
  beforeEach(() => {
    createBugReport.mockReset();
  });

  it("shows the sign-in CTA when anonymous", () => {
    authStatus = "anonymous";
    render(<BugReportRoute />);
    expect(screen.getByText(/sign in to file a bug/i)).toBeInTheDocument();
    expect(screen.queryByText(/describe the bug/i)).not.toBeInTheDocument();
  });

  it("shows the form when authenticated", () => {
    authStatus = "authenticated";
    render(<BugReportRoute />);
    expect(screen.getByText(/describe the bug/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /file report/i }),
    ).toBeInTheDocument();
  });

  it("blocks submitting an empty description at the field layer", () => {
    authStatus = "authenticated";
    const { container } = render(<BugReportRoute />);

    // Dispatch the form's submit directly: the browser's native `required`
    // attribute would short-circuit a real click before our handler runs,
    // but we want to assert our own field-level guard rejects the empty body.
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(screen.getByRole("alert")).toHaveTextContent(/describe the bug/i);
    expect(createBugReport).not.toHaveBeenCalled();
  });
});
