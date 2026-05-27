/**
 * Smoke test that the InterlinearColumn renders the "desktop app" hint on
 * web when wordsByVerse is empty across the whole chapter (the web ingest
 * deliberately skips the `word` table to fit Supabase's free tier).
 *
 * Tauri keeps its existing fall-through behavior: when a chapter genuinely
 * has no aligned tokens (e.g. an untagged book), it renders verse text in
 * place of tokens — no hint.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/platform", () => ({
  getPlatform: vi.fn(() => ({ info: { isDesktop: false } })),
}));
import { getPlatform } from "@/platform";
const mockGetPlatform = vi.mocked(getPlatform);

import { InterlinearColumn } from "./InterlinearColumn";
import type { ChapterPayload } from "@/db/queries";

const chapter: ChapterPayload = {
  book: {
    id: 1, language: "he", canon: "protestant", slug: "gen",
    name: "Genesis", abbreviation: "Gen", testament: "old", order_index: 1,
  },
  chapter: { id: 10, book_id: 1, number: 1, verse_count: 1 },
  verses: [
    { id: 100, chapter_id: 10, number: 1, text: "בְּרֵאשִׁית", text_plain: "בְּרֵאשִׁית", lead: null },
  ],
  wordsByVerse: {}, // empty — what the web Postgres ingest returns
  chapterNumbers: [1],
};

function renderColumn() {
  return render(
    <InterlinearColumn
      primary="he"
      secondary="en_bsb"
      chapter={chapter}
      isPending={false}
      error={null}
      chapterNum={1}
      maxWidth="600px"
      highlights={[]}
      notes={[]}
      selection={null}
      onSelectVerse={() => {}}
      onOpenStrongs={() => {}}
    />,
  );
}

describe("InterlinearColumn desktop-only hint", () => {
  beforeEach(() => {
    mockGetPlatform.mockReturnValue({ info: { isDesktop: false } } as never);
  });

  it("shows the desktop-app hint on web when wordsByVerse is empty", () => {
    renderColumn();
    expect(screen.getByText(/strong's interlinear/i)).toBeInTheDocument();
    expect(screen.getByText(/desktop app/i)).toBeInTheDocument();
  });

  it("does not show the hint on Tauri (empty wordsByVerse renders verse text)", () => {
    mockGetPlatform.mockReturnValue({ info: { isDesktop: true } } as never);
    renderColumn();
    expect(screen.queryByText(/strong's interlinear/i)).not.toBeInTheDocument();
  });
});
