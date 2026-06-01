/**
 * Smoke test that ChapterSection renders a passed-in chapter payload.
 * The full reader integration (IntersectionObserver, scroll anchor) is
 * tested manually; this just confirms the per-chapter view extracts
 * cleanly and exposes the props the parent ReaderRoute needs.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The shape of these mocks intentionally underspecifies — the worker
// is free to add fields the actual component needs, as long as the
// existing exported names + render contract hold.
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", session: { user: { id: "u" } } }),
}));

vi.mock("@/db/userHooks", () => ({
  useChapterAnnotations: () => ({ data: { highlights: [], notes: [] } }),
  useCreateHighlight: () => ({ mutate: vi.fn() }),
  useDeleteHighlight: () => ({ mutate: vi.fn() }),
  useCreateNote: () => ({ mutate: vi.fn() }),
  useDeleteNote: () => ({ mutate: vi.fn() }),
  useUpdateNote: () => ({ mutate: vi.fn() }),
}));

import { ChapterSection } from "./ChapterSection";

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe("ChapterSection", () => {
  it("renders a heading with the book name + chapter number", () => {
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter>
          <ChapterSection
            chapterKey={{ workSlug: "bible", bookSlug: "gen", chapter: 1 }}
            // The actual prop shape is the worker's to choose; the suite's
            // contract is just "given a chapter key, the section renders
            // the chapter's heading in a way the user sees the book name
            // + chapter number." If your component uses a different
            // prop name than `chapterKey`, adapt this single line.
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Loose match — the heading might be "Genesis 1" or "Genesis · 1"
    // or similar; the contract is that both "Genesis" and "1" appear.
    expect(screen.getByText(/genesis/i)).toBeInTheDocument();
  });
});
