import type { ChapterPayload } from "@/db/queries";
import type { HighlightRow, NoteRow } from "@/db/types";
import {
  equivalentFor,
  interlinearLabel,
  type PrimaryLang,
  type SecondaryLang,
} from "@/domain/tabs";
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
  selectedVerse: number | null;
  onSelectVerse: (n: number | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
  isPrimary: boolean;
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
  selectedVerse,
  onSelectVerse,
  onOpenStrongs,
  isPrimary,
}: Props) {
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
          // Universal (translation === null) verse-level highlights apply;
          // partial highlights on the secondary translation do not (the
          // surface words are primary-language).
          const verseHls = highlights.filter(
            (h) =>
              h.verse === v.number &&
              h.translation === null &&
              h.start_token == null,
          );
          const hl = verseHls[0];
          const hasNote = notes.some((n) => n.verse === v.number);
          const isSelected = isPrimary && selectedVerse === v.number;
          const wrapperClass = [
            "al-verse-inline",
            "al-il-verse",
            hl ? `al-hl al-hl-${hl.color}` : null,
            isSelected ? "al-verse-selected" : null,
            hasNote ? "al-verse-noted" : null,
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
                onClick={
                  isPrimary
                    ? () => onSelectVerse(isSelected ? null : v.number)
                    : undefined
                }
                style={isPrimary ? { cursor: "pointer" } : undefined}
              >
                <sup
                  id={`v${v.number}`}
                  data-verse-anchor={v.number}
                  className="al-verse-num-inline al-il-vnum"
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
                            onOpenStrongs={onOpenStrongs}
                          />
                        );
                      })
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
