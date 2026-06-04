/**
 * InviteCode contract: every member can copy the code to the clipboard; only
 * owners/moderators see the Rotate action (mirroring the backend's
 * can_rotate_invite_code authority — the button's absence is UX, the 403 is
 * the enforcement); rotation asks for confirmation before firing, since the
 * old code dies immediately.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("./api", () => ({
  rotateInviteCode: vi.fn(),
}));

import * as api from "./api";
import { InviteCode } from "./InviteCode";
import type { StudyGroup } from "./types";

const mockRotate = vi.mocked(api.rotateInviteCode);

function group(role: StudyGroup["role"]): StudyGroup {
  return {
    id: "g1",
    name: "Romans study",
    invite_code: "ABCD2345",
    created_by: "someone",
    created_at: 1,
    deleted_at: null,
    role,
  };
}

function renderWith(g: StudyGroup) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<InviteCode group={g} />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InviteCode", () => {
  it("copies the code to the clipboard and flashes Copied", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    renderWith(group("member"));
    fireEvent.click(screen.getByRole("button", { name: /copy invite code/i }));

    expect(writeText).toHaveBeenCalledWith("ABCD2345");
    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());
  });

  it("hides Rotate from plain members", () => {
    renderWith(group("member"));
    expect(screen.queryByRole("button", { name: /rotate/i })).toBeNull();
  });

  it.each(["owner", "moderator"] as const)(
    "shows Rotate to a %s and rotates after confirmation",
    async (role) => {
      mockRotate.mockResolvedValue({ ...group(role), invite_code: "WXYZ6789" });
      vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

      renderWith(group(role));
      fireEvent.click(screen.getByRole("button", { name: /rotate/i }));

      await waitFor(() => expect(mockRotate).toHaveBeenCalledWith("g1"));
    },
  );

  it("does not rotate when the confirmation is declined", () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));

    renderWith(group("owner"));
    fireEvent.click(screen.getByRole("button", { name: /rotate/i }));

    expect(mockRotate).not.toHaveBeenCalled();
  });
});
