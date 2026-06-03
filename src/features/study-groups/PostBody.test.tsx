/**
 * Scripture autolinking in post bodies. Uses the real detector (pure domain
 * code, no mocks) — these tests pin the integration: citations become feed
 * deep links, surrounding prose is preserved, and the detector's
 * conservative guards (no lowercase books, no bare book names) hold in the
 * post-rendering context.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PostBody } from "./PostBody";

function renderBody(body: string) {
  return render(
    <MemoryRouter>
      <PostBody body={body} groupId="g1" />
    </MemoryRouter>,
  );
}

describe("PostBody scripture autolinking", () => {
  it("links a citation to this group's feed at that verse", () => {
    renderBody("This echoes Rom. 1:20 pretty directly.");
    const link = screen.getByText("Rom. 1:20");
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "/study-groups/g1?work=bible&book=rom&chapter=1&verse=20",
    );
    // Surrounding prose is preserved around the link.
    expect(screen.getByText(/This echoes/)).toBeInTheDocument();
    expect(screen.getByText(/pretty directly/)).toBeInTheDocument();
  });

  it("links multiple citations independently", () => {
    renderBody("Compare John 3:16 with 1 Cor 13:4.");
    expect(screen.getByText("John 3:16").closest("a")).toHaveAttribute(
      "href",
      "/study-groups/g1?work=bible&book=john&chapter=3&verse=16",
    );
    expect(screen.getByText("1 Cor 13:4").closest("a")).toHaveAttribute(
      "href",
      "/study-groups/g1?work=bible&book=1cor&chapter=13&verse=4",
    );
  });

  it("lands chapter-only citations on verse 1", () => {
    renderBody("Read Ps. 23 tonight.");
    expect(screen.getByText("Ps. 23").closest("a")).toHaveAttribute(
      "href",
      "/study-groups/g1?work=bible&book=ps&chapter=23&verse=1",
    );
  });

  it("renders plain text untouched when nothing matches", () => {
    const { container } = renderBody("No citations here, just thoughts.");
    expect(container.querySelector("a")).toBeNull();
    expect(
      screen.getByText("No citations here, just thoughts."),
    ).toBeInTheDocument();
  });

  it("keeps the detector's conservative guards (lowercase never links)", () => {
    // "is 1" could read as Isaiah 1; the Titlecase guard must hold here too.
    const { container } = renderBody("the answer is 1:20 in my opinion");
    expect(container.querySelector("a")).toBeNull();
  });
});
