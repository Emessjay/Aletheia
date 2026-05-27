import type { ChapterPayload } from "@/db/queries";
import type { HighlightRow, NoteRow } from "@/db/types";
import {
  equivalentFor,
  interlinearLabel,
  type PrimaryLang,
  type SecondaryLang,
} from "@/domain/tabs";
import { sideOf, type SideKey } from "@/domain/sides";
import { getPlatform } from "@/platform";
import type { VerseSelection } from "./ReaderRoute";
import { InterlinearWord } from "./InterlinearWord";
import { toRoman } from "./roman";

interface Props {
  primary: PrimaryLang;
  secondary: SecondaryLang;
  chapter: ChapterPayload | null;
  isPending: boolean;
  error: unknown;
  chapterNum: number;
  maxWidth: string;
  highlights: HighlightRow[];
  notes: NoteRow[];
  selection: VerseSelection | null;
  onSelectVerse: (n: number | null, side: SideKey | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
}

/**
 * Interlinear column. Renders primary-language words with the Strong's gloss
 * stacked beneath each one. Hebrew primary flows RTL; Greek primary flows LTR.
 * Per-character highlighting and translation-side text are not rendered here —
 * users can still split the tab to access the secondary verse as a column.
 */
export function InterlinearColumn({
  primary,
  secondary,
  chapter,
  isPending,
  error,
  chapterNum,
  maxWidth,
  highlights,
  notes,
  selection,
  onSelectVerse,
  onOpenStrongs,
}: Props) {
  const colSide = sideOf(primary);
  const label = interlinearLabel(primary, secondary);

  if (isPending) {
    return (
      <section style={{ maxWidth, minWidth: 0 }}>
        <Header label={label} bookName={null} chapterNum={chapterNum} />
        <p style={{ color: "var(--color-fg-muted)" }}>Loading…</p>
      </section>
    );
  }
  if (error) {
    return (
      <section style={{ maxWidth, minWidth: 0 }}>
        <Header label={label} bookName={null} chapterNum={chapterNum} />
        <pre style={{ color: "var(--color-accent)" }}>{String(error)}</pre>
      </section>
    );
  }
  if (!chapter) {
    return (
      <section style={{ maxWidth, minWidth: 0 }}>
        <Header label={label} bookName={null} chapterNum={chapterNum} />
        <p style={{ color: "var(--color-fg-subtle)", fontStyle: "italic" }}>
          Not available.
        </p>
      </section>
    );
  }

  const tokenLang: "he" | "grc" = primary === "he" ? "he" : "grc";
  const rtl = primary === "he";

  // The web Postgres ingest deliberately skips the `word` table to fit the
  // Supabase free-tier quota — see CLAUDE.md. When no verse in this chapter
  // has any aligned tokens AND we're on web, the data is missing wholesale
  // rather than absent on a specific verse (Apocrypha etc.); surface a
  // friendly notice instead of silently rendering verse text in an
  // interlinear-shaped frame. Tauri reads from its bundled SQLite and keeps
  // existing behavior for genuinely-untagged verses.
  const isDesktop = getPlatform().info.isDesktop;
  const hasAnyWords = chapter.verses.some(
    (v) => (chapter.wordsByVerse[v.id] ?? []).length > 0,
  );
  if (!isDesktop && !hasAnyWords) {
    return (
      <section style={{ maxWidth }} data-interlinear-desktop-only>
        <Header
          label={label}
          bookName={chapter.book.name}
          chapterNum={chapter.chapter.number}
        />
        <p style={{ color: "var(--color-fg-muted)" }}>
          Strong's interlinear is available in the <strong>desktop app</strong>.
        </p>
      </section>
    );
  }

  return (
    <section style={{ maxWidth }}>
      <Header
        label={label}
        bookName={chapter.book.name}
        chapterNum={chapter.chapter.number}
      />
      <div
        className="al-chapter-flow al-il-flow"
        data-column={primary}
        lang={tokenLang}
        dir={rtl ? "rtl" : "ltr"}
      >
        {chapter.verses.map((v) => {
          const words = chapter.wordsByVerse[v.id] ?? [];
          // Verse-level highlights apply (universal + this side's). Partial
          // highlights never render here — the surface tokens are primary-
          // language, so secondary-language character offsets wouldn't align.
          const verseHls = highlights.filter(
            (h) =>
              h.verse === v.number &&
              h.start_token == null &&
              (h.translation === null || h.translation === colSide),
          );
          const hl = verseHls[0];
          const hasNote = notes.some((n) => n.verse === v.number);
          const isSelected =
            selection?.number === v.number && selection?.side === colSide;
          // Highlight tints only primary-text spans (verse number + each
          // surface token), never the gloss row beneath each word — matches
          // the normal-side rule that highlights cover only primary text.
          const hlClass = hl ? `al-hl al-hl-${hl.color}` : null;
          const wrapperClass = [
            "al-verse-inline",
            "al-il-verse",
            isSelected ? "al-verse-selected" : null,
            hasNote ? "al-verse-noted" : null,
          ]
            .filter(Boolean)
            .join(" ");
          const vnumClass = [
            "al-verse-num-inline",
            "al-il-vnum",
            hlClass,
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <span key={v.id}>
              <span className="al-verse-spacer" data-spacer={v.number} />
              <span
                className={wrapperClass}
                data-verse-text={v.number}
                lang={tokenLang}
                onClick={() =>
                  onSelectVerse(isSelected ? null : v.number, colSide)
                }
                style={{ cursor: "pointer" }}
              >
                <sup
                  id={`v${v.number}`}
                  data-verse-anchor={v.number}
                  className={vnumClass}
                >
                  {v.number}
                </sup>
                <span data-verse-body={v.number} className="al-il-body">
                  {words.length > 0
                    ? words.map((w, i) => {
                        // Both BSB and KJV pairs render STEPBible's per-word
                        // English (BSB-derived from TAHOT/TAGNT col 3). No
                        // dictionary-gloss fallback — show '—' when no
                        // aligned word exists, same for both pairs.
                        const equivalent = equivalentFor(w.english);
                        return (
                          <InterlinearWord
                            key={`${w.id}-${i}`}
                            surface={w.surface}
                            gloss={equivalent === "" ? "—" : equivalent}
                            strongs={w.strongs}
                            lang={tokenLang}
                            highlightColor={hl?.color ?? null}
                            onOpenStrongs={onOpenStrongs}
                          />
                        );
                      })
                    : hlClass
                      ? <span className={hlClass}>{v.text_plain}</span>
                      : v.text_plain}
                </span>
              </span>{" "}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function Header({
  label,
  bookName,
  chapterNum,
}: {
  label: string;
  bookName: string | null;
  chapterNum: number;
}) {
  return (
    <header style={{ marginBottom: "1.25rem" }}>
      <p className="al-eyebrow">{label}</p>
      <p className="al-chapter-label" style={{ marginTop: 4 }}>
        {bookName ? `${bookName} · Chapter ${toRoman(chapterNum)}` : "—"}
      </p>
    </header>
  );
}
