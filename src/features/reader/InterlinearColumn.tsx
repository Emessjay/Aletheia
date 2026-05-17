import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChapterPayload } from "@/db/queries";
import { getStrongsByIds } from "@/db/queries";
import type { HighlightRow, NoteRow, StrongsRow } from "@/db/types";
import {
  glossFor,
  interlinearLabel,
  type PrimaryLang,
  type SecondaryLang,
} from "@/domain/tabs";
import { sideOf, type SideKey } from "@/domain/sides";
import type { VerseSelection } from "./ReaderRoute";
import { InterlinearWord } from "./InterlinearWord";
import { renderGloss } from "./glossRefs";
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

  // Collect unique Strong's ids in this chapter. wordsByVerse is empty for
  // non-tagged langs; primary is always he|gk so this is safe.
  const strongsIds = useMemo(() => {
    if (!chapter) return [] as string[];
    const set = new Set<string>();
    for (const verseWords of Object.values(chapter.wordsByVerse)) {
      for (const w of verseWords) {
        if (w.strongs) set.add(w.strongs);
      }
    }
    return Array.from(set).sort();
  }, [chapter]);

  const strongsQuery = useQuery({
    queryKey: ["corpus", "strongsByIds", strongsIds.join(",")],
    queryFn: () => getStrongsByIds(strongsIds),
    enabled: strongsIds.length > 0,
  });

  // Glosses reference other Strong's entries (e.g. G1078's gloss is
  // "from the same as G1074"). Pull those referenced rows so the gloss can
  // render the lemma in place of the bare ID.
  const xrefIds = useMemo(() => {
    const data = strongsQuery.data;
    if (!data) return [] as string[];
    const set = new Set<string>();
    const RE = /\b(?:([GH])(\d{1,5})|(\d{2,5}))\b/g;
    for (const row of data.values()) {
      const text = glossFor(row, secondary);
      if (!text) continue;
      const defaultPrefix: "G" | "H" = row.language === "he" ? "H" : "G";
      RE.lastIndex = 0;
      for (let m = RE.exec(text); m; m = RE.exec(text)) {
        const prefix = (m[1] ?? defaultPrefix) as "G" | "H";
        const num = m[2] ?? m[3];
        const id = prefix + num;
        if (!data.has(id)) set.add(id);
      }
    }
    return Array.from(set).sort();
  }, [strongsQuery.data, secondary]);

  const xrefQuery = useQuery({
    queryKey: ["corpus", "strongsXrefIds", xrefIds.join(",")],
    queryFn: () => getStrongsByIds(xrefIds),
    enabled: xrefIds.length > 0,
  });

  const strongsMap = useMemo(() => {
    const m = new Map<string, StrongsRow>(strongsQuery.data ?? []);
    if (xrefQuery.data) for (const [k, v] of xrefQuery.data) m.set(k, v);
    return m;
  }, [strongsQuery.data, xrefQuery.data]);

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
                onClick={() =>
                  onSelectVerse(isSelected ? null : v.number, colSide)
                }
                style={{ cursor: "pointer" }}
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
                        const wordRow = w.strongs
                          ? strongsMap.get(w.strongs)
                          : undefined;
                        const glossText = glossFor(wordRow, secondary);
                        const defaultPrefix: "G" | "H" =
                          wordRow?.language === "he" ? "H" : "G";
                        const glossNode = glossText
                          ? renderGloss(glossText, defaultPrefix, strongsMap)
                          : null;
                        return (
                          <InterlinearWord
                            key={`${w.id}-${i}`}
                            surface={w.surface}
                            gloss={glossNode}
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
