/**
 * The reader's "Discuss" panel: anonymous users get the sign-in CTA;
 * authenticated users get one deep link per group, anchored at the verse
 * they selected; group-less users get pointed at /study-groups.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockAuth = vi.fn();
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => mockAuth(),
}));
vi.mock("@/auth/SignInCta", () => ({
  SignInCta: ({ label }: { label: string }) => <button>{label}</button>,
}));

const mockGroups = vi.fn();
vi.mock("./hooks", () => ({
  useGroups: () => mockGroups(),
}));

import { DiscussVersePanel } from "./DiscussVersePanel";

const JOHN_3_16 = { workSlug: "bible", bookSlug: "john", chapter: 3, verse: 16 };

function renderPanel() {
  return render(
    <MemoryRouter>
      <DiscussVersePanel ref_={JOHN_3_16} />
    </MemoryRouter>,
  );
}

describe("DiscussVersePanel", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockGroups.mockReset();
    mockAuth.mockReturnValue({ status: "authenticated", session: null });
  });

  it("shows the sign-in CTA when anonymous", () => {
    mockAuth.mockReturnValue({ status: "anonymous", session: null });
    renderPanel();
    expect(
      screen.getByText("Sign in to discuss this verse in a group"),
    ).toBeInTheDocument();
  });

  it("links each group to its feed anchored at the selected verse", () => {
    mockGroups.mockReturnValue({
      isPending: false,
      isError: false,
      data: [
        { id: "g1", name: "Romans study" },
        { id: "g2", name: "Dorm Bible study" },
      ],
    });
    renderPanel();
    const link = screen.getByText(/Romans study/).closest("a");
    expect(link).toHaveAttribute(
      "href",
      "/study-groups/g1?work=bible&book=john&chapter=3&verse=16",
    );
    expect(screen.getByText(/Dorm Bible study/)).toBeInTheDocument();
  });

  it("points group-less users at the groups page", () => {
    mockGroups.mockReturnValue({ isPending: false, isError: false, data: [] });
    renderPanel();
    const link = screen.getByText("Create or join one").closest("a");
    expect(link).toHaveAttribute("href", "/study-groups");
  });
});
