/**
 * Smoke test that the cross-refs popup renders the "desktop app" hint on
 * web when `useVerseXrefs` returns no rows (the web Postgres ingest
 * deliberately skips the `xref` table to fit Supabase's free tier).
 *
 * On Tauri, empty results keep the existing "No cross-references." copy —
 * that path covers genuinely-refless verses.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/platform", () => ({
  getPlatform: vi.fn(() => ({ info: { isDesktop: false } })),
}));
import { getPlatform } from "@/platform";
const mockGetPlatform = vi.mocked(getPlatform);

vi.mock("@/db/hooks", () => ({
  useVerseXrefs: vi.fn(() => ({
    isPending: false,
    isError: false,
    error: null,
    data: [],
  })),
}));

import { CrossRefs } from "./VerseToolbar";

const ref_ = {
  workSlug: "bible" as const,
  bookSlug: "gen",
  chapter: 1,
  verse: 1,
};

describe("CrossRefs desktop-only hint", () => {
  beforeEach(() => {
    mockGetPlatform.mockReturnValue({ info: { isDesktop: false } } as never);
  });

  it("shows the desktop-app hint on web when xref rows are empty", () => {
    render(<MemoryRouter><CrossRefs ref_={ref_} /></MemoryRouter>);
    expect(screen.getByText(/treasury of scripture knowledge/i)).toBeInTheDocument();
    expect(screen.getByText(/desktop app/i)).toBeInTheDocument();
  });

  it("falls back to 'No cross-references.' on Tauri when empty", () => {
    mockGetPlatform.mockReturnValue({ info: { isDesktop: true } } as never);
    render(<MemoryRouter><CrossRefs ref_={ref_} /></MemoryRouter>);
    expect(screen.getByText(/no cross-references/i)).toBeInTheDocument();
    expect(screen.queryByText(/desktop app/i)).not.toBeInTheDocument();
  });
});
