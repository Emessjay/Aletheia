import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useLocation, useParams, Navigate } from "react-router-dom";
import { getChapter, type ChapterPayload } from "@/db/queries";
import { useChapterAnnotations } from "@/db/userHooks";
import type { CorpusLanguage, HighlightRow, NoteRow } from "@/db/types";
import { kvSet } from "@/db/user";
import { isTauri } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { TRANSLATION_LABELS } from "@/domain/translations";
import { StrongsPopover } from "@/features/lexicon/StrongsPopover";
import { VerseInline } from "./VerseInline";
import { VerseToolbar } from "./VerseToolbar";
import { ChapterNav } from "./ChapterNav";
import { ChapterPicker } from "./ChapterPicker";
import { LanguageToggle } from "./LanguageToggle";
import { toRoman } from "./roman";
import { alignVerses } from "./alignVerses";

interface StrongsState {
  id: string;
  rect: DOMRect;
}

const LANG_ATTR: Partial<Record<CorpusLanguage, string>> = {
  he: "he",
  gk: "grc",
  la: "la",
};

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

  // Fetch one chapter per active language. useQueries shares cache keys with
  // useChapter, so other consumers of the same (lang, book, chapter) tuple
  // (e.g. ChapterPicker via the primary) don't double-fetch.
  const chapterQueries = useQueries({
    queries: active.map((lang) => ({
      queryKey: ["corpus", "chapter", lang, book, chapterNum],
      queryFn: () => getChapter(lang, book, chapterNum),
    })),
  });

  // The primary translation drives the chapter selector + nav (chapter list,
  // book name in primary language).
  const primaryQuery = chapterQueries[0];
  const chapterNumbers = primaryQuery?.data?.chapterNumbers ?? [];
  const primaryBookName = primaryQuery?.data?.book.name ?? null;

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
        chapters={chapterQueries.map((q) => q.data ?? null)}
        pending={chapterQueries.map((q) => q.isPending)}
        errors={chapterQueries.map((q) => q.error)}
        highlights={allHighlights}
        notes={allNotes}
        selectedVerse={selectedVerse}
        onSelectVerse={setSelectedVerse}
        onOpenStrongs={(id, rect) => setStrongs({ id, rect })}
      />
      {selectedVerse !== null ? (
        <div style={{ marginTop: "1.5rem" }}>
          <VerseToolbar
            ref_={{
              workSlug: work,
              bookSlug: book,
              chapter: chapterNum,
              verse: selectedVerse,
            }}
            highlights={allHighlights.filter((h) => h.verse === selectedVerse)}
            notes={allNotes.filter((n) => n.verse === selectedVerse)}
            onDone={() => setSelectedVerse(null)}
          />
        </div>
      ) : null}
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
  chapters,
  pending,
  errors,
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
  chapters: Array<ChapterPayload | null>;
  pending: boolean[];
  errors: Array<unknown>;
  highlights: HighlightRow[];
  notes: NoteRow[];
  selectedVerse: number | null;
  onSelectVerse: (n: number | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dropCapsEnabled = useSettingsStore((s) => s.dropCapsEnabled);
  const fontSize = useSettingsStore((s) => s.fontSize);

  // Cross-column alignment: re-run on chapter/lang changes, on settings that
  // affect line wrapping, on font-load events, and on window resize.
  //
  // Dep includes per-column verse counts so the effect re-runs as each query
  // resolves. ChapterPayload identity is stable per cache hit, so deep equality
  // isn't needed.
  const verseCountsKey = chapters
    .map((c) => c?.verses.length ?? 0)
    .join(",");

  useLayoutEffect(() => {
    if (active.length < 2) return;
    const run = () => alignVerses(containerRef.current);

    run();

    const onResize = () => run();
    window.addEventListener("resize", onResize);

    // Re-align once webfonts finish loading; before that, line wrapping is
    // wrong and the first align bakes in stale spacer heights.
    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(run);
    }

    return () => window.removeEventListener("resize", onResize);
  }, [
    workSlug,
    bookSlug,
    chapterNum,
    active.join(","),
    verseCountsKey,
    dropCapsEnabled,
    fontSize,
  ]);

  return (
    <div
      ref={containerRef}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${active.length}, minmax(0, 1fr))`,
        gap: "2.5rem",
        alignItems: "start",
      }}
    >
      {active.map((lang, i) => (
        <Column
          key={lang}
          language={lang}
          chapter={chapters[i] ?? null}
          isPending={pending[i] ?? false}
          error={errors[i] ?? null}
          chapterNum={chapterNum}
          isPrimary={i === 0}
          maxWidth={active.length > 1 ? "30em" : "var(--measure)"}
          highlights={highlights}
          notes={notes}
          selectedVerse={selectedVerse}
          onSelectVerse={onSelectVerse}
          onOpenStrongs={onOpenStrongs}
          dropCapsEnabled={dropCapsEnabled}
        />
      ))}
    </div>
  );
}

function Column({
  language,
  chapter,
  isPending,
  error,
  chapterNum,
  isPrimary,
  maxWidth,
  highlights,
  notes,
  selectedVerse,
  onSelectVerse,
  onOpenStrongs,
  dropCapsEnabled,
}: {
  language: CorpusLanguage;
  chapter: ChapterPayload | null;
  isPending: boolean;
  error: unknown;
  chapterNum: number;
  isPrimary: boolean;
  maxWidth: string;
  highlights: HighlightRow[];
  notes: NoteRow[];
  selectedVerse: number | null;
  onSelectVerse: (n: number | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
  dropCapsEnabled: boolean;
}) {
  if (isPending) {
    return (
      <section style={{ maxWidth }}>
        <ColumnHeading
          language={language}
          bookName={null}
          chapterNum={chapterNum}
        />
        <p style={{ color: "var(--color-fg-muted)" }}>Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section style={{ maxWidth }}>
        <ColumnHeading
          language={language}
          bookName={null}
          chapterNum={chapterNum}
        />
        <pre style={{ color: "var(--color-accent)" }}>{String(error)}</pre>
      </section>
    );
  }

  if (!chapter) {
    return (
      <section style={{ maxWidth }}>
        <ColumnHeading
          language={language}
          bookName={null}
          chapterNum={chapterNum}
        />
        <p style={{ color: "var(--color-fg-subtle)", fontStyle: "italic" }}>
          Not available in {TRANSLATION_LABELS[language]}.
        </p>
      </section>
    );
  }

  const { book, chapter: c, verses, wordsByVerse } = chapter;

  return (
    <section style={{ maxWidth }}>
      <ColumnHeading
        language={language}
        bookName={book.name}
        chapterNum={c.number}
      />
      <div
        className="al-chapter-flow"
        data-column={language}
        lang={LANG_ATTR[language]}
      >
        {verses.map((v, i) => {
          const verseHls = highlights.filter((h) => h.verse === v.number);
          const verseNotes = notes.filter((n) => n.verse === v.number);
          const isSelected = isPrimary && selectedVerse === v.number;
          return (
            <VerseInline
              key={v.id}
              verse={v}
              words={wordsByVerse[v.id]}
              language={language}
              withDropCap={i === 0 && chapterNum === 1 && dropCapsEnabled}
              highlights={verseHls}
              notes={verseNotes}
              selected={isSelected}
              onSelect={
                isPrimary
                  ? () => onSelectVerse(isSelected ? null : v.number)
                  : undefined
              }
              onOpenStrongs={onOpenStrongs}
            />
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
