/**
 * Smoke test that the HighlightPopover renders a sign-in CTA when the user
 * is unauthenticated. The full popover behavior (color picking, etc.) is
 * covered by existing tests; this file just asserts the auth-gated path.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Stub useAuth — return anonymous or authenticated state per test.
let authStatus: "anonymous" | "authenticated" = "anonymous";
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    status: authStatus,
    session: authStatus === "authenticated"
      ? { user: { id: "u", email: "a@b.c" }, access_token: "t" }
      : null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}));

import { HighlightPopover } from "./HighlightPopover";

describe("HighlightPopover auth gating", () => {
  it("shows 'Sign in to save highlights' when anonymous", () => {
    authStatus = "anonymous";
    render(
      <HighlightPopover
        // Pass minimal props so the popover renders. The worker may need
        // to adjust this stub to match the actual prop shape.
        state={{
          kind: "new", ref: { workSlug: "bible", bookSlug: "gen", chapter: 1, verse: 1 },
          startToken: 0, endToken: 0, translation: "en_modern" as never,
          rect: new DOMRect(),
        }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/sign in to save/i)).toBeInTheDocument();
  });

  it("hides the CTA when authenticated", () => {
    authStatus = "authenticated";
    render(
      <HighlightPopover
        state={{
          kind: "new", ref: { workSlug: "bible", bookSlug: "gen", chapter: 1, verse: 1 },
          startToken: 0, endToken: 0, translation: "en_modern" as never,
          rect: new DOMRect(),
        }}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText(/sign in to save/i)).not.toBeInTheDocument();
  });
});
