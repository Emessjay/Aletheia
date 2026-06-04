import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Sidebar reads the book list from useBooks; stub it with a tiny fixture
// so the test doesn't touch the corpus. Only useBooks is consumed by
// Sidebar.
vi.mock("@/db/hooks", () => ({
  useBooks: () => ({
    data: [
      { id: 1, slug: "luke", name: "Luke", testament: "new" },
      { id: 2, slug: "john", name: "John", testament: "new" },
    ],
  }),
}));

import { Sidebar } from "@/features/reader/Sidebar";
import { useReaderLocationStore } from "@/stores/useReaderLocationStore";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reader/:work/:book/:chapter" element={<Sidebar />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Sidebar active-book highlight", () => {
  beforeEach(() => {
    useReaderLocationStore.getState().clear();
  });

  it("falls back to the route param when the store is empty", () => {
    renderAt("/reader/bible/john/1");
    expect(screen.getByRole("link", { name: "John" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Luke" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("tracks the reader's current book over the stale route param", () => {
    // URL still says john (replaceState never updated the router param),
    // but the user has scrolled into Luke.
    useReaderLocationStore
      .getState()
      .setLocation({ workSlug: "bible", bookSlug: "luke", chapter: 24 });
    renderAt("/reader/bible/john/1");
    expect(screen.getByRole("link", { name: "Luke" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "John" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("a stale store value persists until cleared (pins the clear() cleanup contract)", () => {
    // Simulate a prior visit that published Luke, then a fresh visit to
    // John without the store being cleared: the store still wins, which
    // is exactly the stale-highlight bug — so cleanup MUST run on reader
    // unmount. After clear(), a fresh render falls back to the param.
    useReaderLocationStore
      .getState()
      .setLocation({ workSlug: "bible", bookSlug: "luke", chapter: 24 });
    renderAt("/reader/bible/john/1");
    expect(screen.getByRole("link", { name: "Luke" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // cleanup happened (reader unmounted):
    useReaderLocationStore.getState().clear();
    cleanupRerender("/reader/bible/john/1");
    expect(screen.getByRole("link", { name: "John" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

// Re-render helper: testing-library auto-cleans between tests, but within
// one test we render twice, so unmount the first tree first.
import { cleanup } from "@testing-library/react";
function cleanupRerender(path: string) {
  cleanup();
  renderAt(path);
}
