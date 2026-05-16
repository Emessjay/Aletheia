import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useLocation, useParams, Navigate } from "react-router-dom";
import { getChapter, type ChapterPayload } from "@/db/queries";
import {
  useChapterAnnotations,
  useCreateHighlight,
  useDeleteHighlight,
} from "@/db/userHooks";
import type {
  CorpusLanguage,
  HighlightColor,
  HighlightRow,
  NoteRow,
  VerseRef,
} from "@/db/types";
import { kvSet } from "@/db/user";
import { isTauri } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { TRANSLATION_LABELS } from "@/domain/translations";
import { StrongsPopover } from "@/features/lexicon/StrongsPopover";
import { VerseInline } from "./VerseInline";
import { VerseToolbar } from "./VerseToolbar";
import { HighlightPopover } from "./HighlightPopover";
import { ChapterNav } from "./ChapterNav";
import { ChapterPicker } from "./ChapterPicker";
import { LanguageToggle } from "./LanguageToggle";
import { toRoman } from "./roman";
import { alignVerses } from "./alignVerses";

interface StrongsState {
  id: string;
  rect: DOMRect;
}

interface NewHighlightState {
  kind: "new";
  ref: VerseRef;
  startToken: number;
  endToken: number;
  translation: string;
  rect: DOMRect;
}

interface EditHighlightState {
  kind: "edit";
  ref: VerseRef;
  highlightId: string;
  color: HighlightColor;
  rect: DOMRect;
}

type HighlightUiState = NewHighlightState | EditHighlightState;

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
  const [toolbarAnchor, setToolbarAnchor] = useState<
    { top: number; left: number; width: number; placement: "below" | "above" } | null
  >(null);
  const [hlUi, setHlUi] = useState<HighlightUiState | null>(null);
  const createHl = useCreateHighlight();
  const deleteHl = useDeleteHighlight();
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

  // Anchor the floating verse toolbar to the bottom of the selected verse,
  // tracking the position as the user scrolls or the layout reflows. We use
  // viewport-relative coords so the toolbar can be `position: fixed` and live
  // on a layer above the chapter text.
  useLayoutEffect(() => {
    if (selectedVerse === null) {
      setToolbarAnchor(null);
      return;
    }
    const compute = () => {
      const verseEl = document.querySelector<HTMLElement>(
        `[data-verse-text="${selectedVerse}"]`,
      );
      if (!verseEl) {
        setToolbarAnchor(null);
        return;
      }
      const verseRect = verseEl.getBoundingClientRect();
      const section = verseEl.closest("section");
      const colRect = section?.getBoundingClientRect();
      const left = colRect?.left ?? verseRect.left;
      const width = colRect?.width ?? verseRect.width;
      // Prefer below; flip above if there isn't enough room.
      const estHeight = 160;
      const gap = 8;
      const placeBelow =
        window.innerHeight - verseRect.bottom >= estHeight + gap ||
        verseRect.top < estHeight + gap;
      const top = placeBelow
        ? verseRect.bottom + gap
        : verseRect.top - gap - estHeight;
      setToolbarAnchor({
        top,
        left,
        width,
        placement: placeBelow ? "below" : "above",
      });
    };
    compute();
    const onScroll = () => compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", onScroll);
    };
  }, [selectedVerse, active.join(",")]);

  // Reset the highlight popover when the chapter changes.
  useEffect(() => {
    setHlUi(null);
  }, [work, book, chapterNum]);

  // Detect text selection inside a verse body and open the color popover. The
  // selection must be non-collapsed and live entirely within a single
  // [data-verse-body] element. Character offsets are derived by cloning a
  // range from the body start to the selection's anchor/focus.
  useEffect(() => {
    if (!valid) return;
    const primary = active[0];
    if (!primary) return;
    const onMouseUp = () => {
      // Defer one tick so the click that lands inside an existing highlight
      // span (which sets hlUi to "edit") wins over the selection branch.
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return;
        const startBody = closestVerseBody(range.startContainer);
        const endBody = closestVerseBody(range.endContainer);
        if (!startBody || startBody !== endBody) return;
        const verseNum = Number(startBody.dataset.verseBody);
        if (!Number.isFinite(verseNum) || verseNum < 1) return;
        const startOffset = rangeLength(startBody, range.startContainer, range.startOffset);
        const endOffset = rangeLength(startBody, range.endContainer, range.endOffset);
        const lo = Math.min(startOffset, endOffset);
        const hi = Math.max(startOffset, endOffset);
        if (hi - lo < 1) return;
        const rect = range.getBoundingClientRect();
        setHlUi({
          kind: "new",
          ref: {
            workSlug: work,
            bookSlug: book,
            chapter: chapterNum,
            verse: verseNum,
          },
          startToken: lo,
          endToken: hi,
          translation: primary,
          rect,
        });
      });
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [valid, active.join(","), work, book, chapterNum]);

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
        onOpenHighlight={(highlightId, rect) => {
          const h = allHighlights.find((x) => x.id === highlightId);
          if (!h) return;
          window.getSelection()?.removeAllRanges();
          setHlUi({
            kind: "edit",
            ref: {
              workSlug: h.work_slug,
              bookSlug: h.book_slug,
              chapter: h.chapter,
              verse: h.verse,
            },
            highlightId,
            color: h.color,
            rect,
          });
        }}
      />
      {selectedVerse !== null && toolbarAnchor ? (
        <div
          role="dialog"
          aria-label={`Annotations for verse ${selectedVerse}`}
          style={{
            position: "fixed",
            top: toolbarAnchor.top,
            left: toolbarAnchor.left,
            width: toolbarAnchor.width,
            maxHeight: "60vh",
            overflowY: "auto",
            background: "var(--color-bg)",
            border: "1px solid var(--color-rule)",
            boxShadow: "var(--shadow-pop)",
            padding: "10px 14px",
            zIndex: 150,
          }}
        >
          <VerseToolbar
            ref_={{
              workSlug: work,
              bookSlug: book,
              chapter: chapterNum,
              verse: selectedVerse,
            }}
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
      {hlUi ? (
        <HighlightPopover
          anchorRect={hlUi.rect}
          activeColor={hlUi.kind === "edit" ? hlUi.color : null}
          onPick={(color) => {
            if (hlUi.kind === "new") {
              createHl.mutate({
                ref: hlUi.ref,
                color,
                translation: hlUi.translation,
                range: { startToken: hlUi.startToken, endToken: hlUi.endToken },
              });
              window.getSelection()?.removeAllRanges();
            } else {
              // Replace: delete the old, insert a new one with the same range.
              const old = allHighlights.find((h) => h.id === hlUi.highlightId);
              if (old && old.start_token != null && old.end_token != null) {
                deleteHl.mutate({ id: old.id, ref: hlUi.ref });
                createHl.mutate({
                  ref: hlUi.ref,
                  color,
                  translation: old.translation,
                  range: { startToken: old.start_token, endToken: old.end_token },
                });
              }
            }
            setHlUi(null);
          }}
          onRemove={
            hlUi.kind === "edit"
              ? () => {
                  deleteHl.mutate({ id: hlUi.highlightId, ref: hlUi.ref });
                  setHlUi(null);
                }
              : undefined
          }
          onClose={() => setHlUi(null)}
        />
      ) : null}
    </article>
  );
}

function closestVerseBody(node: Node | null): HTMLElement | null {
  let n: Node | null = node;
  while (n) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement;
      if (el.dataset && el.dataset.verseBody) return el;
    }
    n = n.parentNode;
  }
  return null;
}

function rangeLength(
  body: HTMLElement,
  endContainer: Node,
  endOffset: number,
): number {
  const r = document.createRange();
  r.setStart(body, 0);
  r.setEnd(endContainer, endOffset);
  const length = r.toString().length;
  r.detach?.();
  return length;
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
  onOpenHighlight,
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
  onOpenHighlight: (highlightId: string, rect: DOMRect) => void;
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
          onOpenHighlight={onOpenHighlight}
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
  onOpenHighlight,
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
  onOpenHighlight: (highlightId: string, rect: DOMRect) => void;
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
          // Verse-level highlights (translation === null) are universal;
          // partial highlights are scoped to the translation they were created
          // against so they don't bleed across columns.
          const verseHls = highlights.filter(
            (h) =>
              h.verse === v.number &&
              (h.translation === null || h.translation === language),
          );
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
              onOpenHighlight={isPrimary ? onOpenHighlight : undefined}
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
