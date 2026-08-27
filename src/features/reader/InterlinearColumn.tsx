import type { ChapterPayload } from "@/db/queries";
import type { HighlightRow, NoteRow } from "@/db/types";
import {
  bsbEnglishSurface,
  bsbOriginalUndertext,
  equivalentForGreekSurface,
  interlinearLabel,
  isEnglishPrimary,
  wordsForEnglishPrimary,
  type PrimaryLang,
  type SecondaryLang,
} from "@/domain/tabs";
import { sideOf, type SideKey } from "@/domain/sides";
import {
  isPackInstalled,
  useCorpusPacks,
} from "@/db/useCorpusPacks";
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
 * Interlinear column. Renders primary-language words with secondary text
 * stacked beneath each one.
 *
 * - Original primary (`he`|`gk`): Hebrew/Greek surface, STEPBible BSB-derived
 *   English underneath. Flows RTL for Hebrew.
 * - English primary (`en_bsb`): BSB English surface in reading order, original
 *   language underneath from BSB Translation Tables. LTR.
 *
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
  const packs = useCorpusPacks();
  const interlinearOn = isPackInstalled(packs.data, "interlinear");

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

  const englishPrimary = isEnglishPrimary(primary);
  const surfaceLang = englishPrimary
    ? "en"
    : primary === "he"
      ? "he"
      : "grc";
  const glossLang = englishPrimary
    ? secondary === "he"
      ? "he"
      : "grc"
    : undefined;
  const rtl = primary === "he";
  const anyWords = chapter.verses.some(
    (v) => (chapter.wordsByVerse[v.id] ?? []).length > 0,
  );

  return (
    <section style={{ maxWidth }}>
      <Header
        label={label}
        bookName={chapter.book.name}
        chapterNum={chapter.chapter.number}
      />
      {!interlinearOn || !anyWords ? (
        <p
          style={{
            color: "var(--color-fg-muted)",
            fontSize: 13,
            fontStyle: "italic",
            margin: "0 0 12px",
          }}
        >
          {!interlinearOn
            ? "Interlinear pack not installed — showing plain verse text. Install the pack from Settings → Content packs for word-level Strong's columns."
            : "No word-level rows for this chapter."}
        </p>
      ) : null}
      <div
        className="al-chapter-flow al-il-flow"
        data-column={primary}
        lang={surfaceLang === "en" ? "en" : surfaceLang}
        dir={rtl ? "rtl" : "ltr"}
      >
        {chapter.verses.map((v) => {
          const rawWords = chapter.wordsByVerse[v.id] ?? [];
          const words = englishPrimary
            ? wordsForEnglishPrimary(rawWords, secondary)
            : rawWords;
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
                lang={surfaceLang === "en" ? "en" : surfaceLang}
                onClick={() =>
                  onSelectVerse(isSelected ? null : v.number, colSide)
                }
                style={{ cursor: "pointer" }}
              >
                <sup
                  data-verse-anchor={v.number}
                  className={vnumClass}
                >
                  {v.number}
                </sup>
                <span data-verse-body={v.number} className="al-il-body">
                  {words.length > 0
                    ? words.map((w, i) => {
                        let surface: string;
                        let gloss: string;
                        if (englishPrimary) {
                          surface = bsbEnglishSurface(w.surface);
                          const under = bsbOriginalUndertext(w.english);
                          gloss = under === "" ? "—" : under;
                        } else {
                          surface = w.surface;
                          const equivalent = equivalentForGreekSurface(
                            w.english,
                            w.surface,
                          );
                          gloss = equivalent === "" ? "—" : equivalent;
                        }
                        if (surface === "" && gloss === "—") return null;
                        return (
                          <InterlinearWord
                            key={`${w.id}-${i}`}
                            surface={surface || "—"}
                            gloss={gloss}
                            strongs={w.strongs}
                            lemma={w.lemma}
                            lang={surfaceLang}
                            glossLang={glossLang}
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
