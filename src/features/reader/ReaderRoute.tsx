import { useEffect, useState } from "react";
import { useLocation, useParams, Navigate } from "react-router-dom";
import { useChapter } from "@/db/hooks";
import { useChapterAnnotations } from "@/db/userHooks";
import type { CorpusLanguage, HighlightRow, NoteRow } from "@/db/types";
import { kvSet } from "@/db/user";
import { isTauri } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { TRANSLATION_LABELS } from "@/domain/translations";
import { StrongsPopover } from "@/features/lexicon/StrongsPopover";
import { VerseRow } from "./VerseRow";
import { VerseToolbar } from "./VerseToolbar";
import { ChapterNav } from "./ChapterNav";
import { ChapterPicker } from "./ChapterPicker";
import { LanguageToggle } from "./LanguageToggle";
import { toRoman } from "./roman";

interface StrongsState {
  id: string;
  rect: DOMRect;
}

export function ReaderRoute() {
  const { work = "", book = "", chapter = "" } = useParams();
  const chapterNum = Number(chapter);
  const valid = Boolean(
    work && book && Number.isFinite(chapterNum) && chapterNum >= 1,
  );

  const active = useSettingsStore((s) => s.activeTranslations);
  const [strongs, setStrongs] = useState<StrongsState | null>(null);
  const [selectedVerse, setSelectedVerse] = useState<number | null>(null);
  const location = useLocation();

  // Reset selection on chapter change.
  useEffect(() => {
    setSelectedVerse(null);
  }, [work, book, chapterNum]);

  // Persist last reading position.
  useEffect(() => {
    if (!valid || !isTauri()) return;
    void kvSet(
      "reader.last",
      JSON.stringify({ work, book, chapter: chapterNum }),
    );
  }, [work, book, chapterNum, valid]);

  // Scroll to #vN anchor after verses mount.
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    let raf = 0;
    let attempts = 0;
    const tryScroll = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (attempts++ < 30) raf = requestAnimationFrame(tryScroll);
    };
    raf = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(raf);
  }, [location.hash, location.pathname]);

  const annotations = useChapterAnnotations(work, book, chapterNum);

  // Primary translation drives the chapter selector + nav. Other columns may
  // be missing this book/chapter, but we always navigate by the primary's
  // chapter list. React Query dedupes this with the per-column fetch.
  const primaryLang = active[0];
  const primaryChapter = useChapter(
    primaryLang ?? "en_bsb",
    book,
    chapterNum,
  );
  const chapterNumbers = primaryChapter.data?.chapterNumbers ?? [];
  const primaryBookName = primaryChapter.data?.book.name ?? null;

  if (!valid) return <Navigate to="/reader/bible/john/1" replace />;

  if (!isTauri()) {
    return (
      <article style={readerWrap}>
        <p style={{ color: "var(--color-fg-muted)" }}>
          Run <code>npm run tauri dev</code> to read the corpus. Browser-only
          dev mode cannot reach the SQLite plugin.
        </p>
      </article>
    );
  }

  const allHighlights = annotations.data?.highlights ?? [];
  const allNotes = annotations.data?.notes ?? [];

  return (
    <article style={readerWrap}>
      <LanguageToggle />
      <div style={{ margin: "0 0 1.75rem" }}>
        <ChapterPicker
          workSlug={work}
          bookSlug={book}
          bookName={primaryBookName}
          current={chapterNum}
          all={chapterNumbers}
        />
      </div>
      <ColumnsLayout
        bookSlug={book}
        workSlug={work}
        chapterNum={chapterNum}
        active={active}
        highlights={allHighlights}
        notes={allNotes}
        selectedVerse={selectedVerse}
        onSelectVerse={setSelectedVerse}
        onOpenStrongs={(id, rect) => setStrongs({ id, rect })}
      />
      {chapterNumbers.length > 0 ? (
        <ChapterNav
          workSlug={work}
          bookSlug={book}
          current={chapterNum}
          all={chapterNumbers}
        />
      ) : null}
      {strongs ? (
        <StrongsPopover
          strongsId={strongs.id}
          anchorRect={strongs.rect}
          onClose={() => setStrongs(null)}
        />
      ) : null}
    </article>
  );
}

function ColumnsLayout({
  workSlug,
  bookSlug,
  chapterNum,
  active,
  highlights,
  notes,
  selectedVerse,
  onSelectVerse,
  onOpenStrongs,
}: {
  workSlug: string;
  bookSlug: string;
  chapterNum: number;
  active: CorpusLanguage[];
  highlights: HighlightRow[];
  notes: NoteRow[];
  selectedVerse: number | null;
  onSelectVerse: (n: number | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${active.length}, minmax(0, 1fr))`,
        gap: "2rem",
      }}
    >
      {active.map((lang, i) => (
        <Column
          key={lang}
          language={lang}
          workSlug={workSlug}
          bookSlug={bookSlug}
          chapterNum={chapterNum}
          isPrimary={i === 0}
          maxWidth={active.length > 1 ? "28em" : "var(--measure)"}
          highlights={highlights}
          notes={notes}
          selectedVerse={selectedVerse}
          onSelectVerse={onSelectVerse}
          onOpenStrongs={onOpenStrongs}
        />
      ))}
    </div>
  );
}

function Column({
  language,
  workSlug,
  bookSlug,
  chapterNum,
  isPrimary,
  maxWidth,
  highlights,
  notes,
  selectedVerse,
  onSelectVerse,
  onOpenStrongs,
}: {
  language: CorpusLanguage;
  workSlug: string;
  bookSlug: string;
  chapterNum: number;
  isPrimary: boolean;
  maxWidth: string;
  highlights: HighlightRow[];
  notes: NoteRow[];
  selectedVerse: number | null;
  onSelectVerse: (n: number | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
}) {
  const q = useChapter(language, bookSlug, chapterNum);
  const dropCapsEnabled = useSettingsStore((s) => s.dropCapsEnabled);

  if (q.isPending) {
    return (
      <section style={{ maxWidth }}>
        <ColumnHeading language={language} bookName={null} chapterNum={chapterNum} />
        <p style={{ color: "var(--color-fg-muted)" }}>Loading…</p>
      </section>
    );
  }

  if (q.isError) {
    return (
      <section style={{ maxWidth }}>
        <ColumnHeading language={language} bookName={null} chapterNum={chapterNum} />
        <pre style={{ color: "var(--color-accent)" }}>{String(q.error)}</pre>
      </section>
    );
  }

  if (!q.data) {
    return (
      <section style={{ maxWidth }}>
        <ColumnHeading language={language} bookName={null} chapterNum={chapterNum} />
        <p style={{ color: "var(--color-fg-subtle)", fontStyle: "italic" }}>
          Not available in {TRANSLATION_LABELS[language]}.
        </p>
      </section>
    );
  }

  const { book, chapter, verses, wordsByVerse } = q.data;

  return (
    <section style={{ maxWidth }}>
      <ColumnHeading
        language={language}
        bookName={book.name}
        chapterNum={chapter.number}
      />
      <div>
        {verses.map((v, i) => {
          const verseHls = highlights.filter((h) => h.verse === v.number);
          const verseNotes = notes.filter((n) => n.verse === v.number);
          const isSelected = isPrimary && selectedVerse === v.number;
          return (
            <div key={v.id}>
              <VerseRow
                verse={v}
                words={wordsByVerse[v.id]}
                language={language}
                withDropCap={i === 0 && dropCapsEnabled}
                highlights={verseHls}
                notes={verseNotes}
                selected={isSelected}
                onSelect={isPrimary ? () => onSelectVerse(isSelected ? null : v.number) : undefined}
                onOpenStrongs={onOpenStrongs}
              />
              {isSelected ? (
                <VerseToolbar
                  ref_={{
                    workSlug,
                    bookSlug,
                    chapter: chapter.number,
                    verse: v.number,
                  }}
                  highlights={verseHls}
                  notes={verseNotes}
                  onDone={() => onSelectVerse(null)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ColumnHeading({
  language,
  bookName,
  chapterNum,
}: {
  language: CorpusLanguage;
  bookName: string | null;
  chapterNum: number;
}) {
  return (
    <header style={{ marginBottom: "1.25rem" }}>
      <p className="al-eyebrow">{TRANSLATION_LABELS[language]}</p>
      <p className="al-chapter-label" style={{ marginTop: 4 }}>
        {bookName ? `${bookName} · Chapter ${toRoman(chapterNum)}` : "—"}
      </p>
    </header>
  );
}

const readerWrap: React.CSSProperties = {
  maxWidth: "min(100%, 80em)",
  margin: "0 auto",
  padding: "2.5rem 2rem 6rem",
};


