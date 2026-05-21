import { Fragment, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useLocation, useParams, Navigate } from "react-router-dom";
import { findBook, getChapter, getChapterCount, type ChapterPayload } from "@/db/queries";
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
  VerseRow,
  WordRow,
} from "@/db/types";
import { kvSet } from "@/db/user";
import { onAnyScroll } from "@/lib/onScroll";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { translationShortLabel } from "@/domain/translations";
import {
  equivalentFor,
  interlinearLabel,
  type InterlinearTab,
  type SingleTab,
  type Tab,
} from "@/domain/tabs";
import { sideOf, type SideKey } from "@/domain/sides";
import {
  activeTabsRequireMTRemap,
  isLXXVersified,
} from "@/domain/versification";
import { NotFoundRoute } from "@/features/notFound/NotFoundRoute";
import { StrongsPopover } from "@/features/lexicon/StrongsPopover";
import { VerseInline } from "./VerseInline";
import { VerseToolbar } from "./VerseToolbar";
import { HighlightPopover } from "./HighlightPopover";
import { ChapterNav } from "./ChapterNav";
import { ChapterPicker } from "./ChapterPicker";
import { AudioPlayer } from "./AudioPlayer";
import { isAudioTranslation, type AudioTranslation } from "@/domain/audio";
import { InterlinearWord } from "./InterlinearWord";
import { LanguageToggle } from "./LanguageToggle";
import { InterlinearColumn } from "./InterlinearColumn";
import { toRoman } from "./roman";

interface StrongsState {
  id: string;
  rect: DOMRect;
}

interface NewHighlightState {
  kind: "new";
  ref: VerseRef;
  startToken: number;
  endToken: number;
  translation: SideKey;
  rect: DOMRect;
}

export interface VerseSelection {
  number: number;
  side: SideKey | null;
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

  const tabs = useSettingsStore((s) => s.tabs);
  const audioBarEnabled = useSettingsStore((s) => s.audioBarEnabled);
  const activeTabs = tabs.filter((t) => t.active);
  // Primary language per active tab — drives chapter fan-out, selection, etc.
  const activeLangs: CorpusLanguage[] = activeTabs.map((t) =>
    t.kind === "single" ? t.lang : t.primary,
  );
  // Subset of activeLangs that maps to an audio-capable translation. Ordered
  // to match tab order so the player's translation menu mirrors what's visible
  // in the reader.
  const audioLangs: AudioTranslation[] = useMemo(() => {
    const seen = new Set<AudioTranslation>();
    const out: AudioTranslation[] = [];
    for (const l of activeLangs) {
      if (isAudioTranslation(l) && !seen.has(l)) {
        seen.add(l);
        out.push(l);
      }
    }
    return out;
  }, [activeLangs.join(",")]);
  const [strongs, setStrongs] = useState<StrongsState | null>(null);
  const [selection, setSelection] = useState<VerseSelection | null>(null);
  const [toolbarAnchor, setToolbarAnchor] = useState<
    { top: number; left: number; width: number; placement: "below" | "above" } | null
  >(null);
  const [hlUi, setHlUi] = useState<HighlightUiState | null>(null);
  const createHl = useCreateHighlight();
  const deleteHl = useDeleteHighlight();
  const location = useLocation();

  // Reset selection on chapter change.
  useEffect(() => {
    setSelection(null);
  }, [work, book, chapterNum]);

  // Persist last reading position.
  useEffect(() => {
    if (!valid) return;
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
    if (selection === null) {
      setToolbarAnchor(null);
      return;
    }
    const compute = () => {
      // Prefer the cell of the side the user actually clicked in (so the
      // toolbar anchors to that column, not always the primary one). Fall back
      // to any cell for the verse, then to the inline span used in single-tab
      // paragraph mode where the wrapping <section> provides the column width.
      const sideSel = selection.side
        ? `[data-verse-cell="${selection.number}"][data-verse-cell-side="${selection.side}"]`
        : null;
      const verseEl =
        (sideSel
          ? document.querySelector<HTMLElement>(sideSel)
          : null) ??
        document.querySelector<HTMLElement>(
          `[data-verse-cell="${selection.number}"]`,
        ) ??
        document.querySelector<HTMLElement>(
          `[data-verse-text="${selection.number}"]`,
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
    // Dismiss the toolbar as soon as the user scrolls — it's a transient
    // overlay anchored to one verse, and following it across a scroll just
    // clutters the page.
    window.addEventListener("resize", compute);
    const teardownScroll = onAnyScroll(() => setSelection(null));
    return () => {
      window.removeEventListener("resize", compute);
      teardownScroll();
    };
  }, [selection, activeLangs.join(",")]);

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
        // Derive the side from the column the user actually selected text in
        // — not the primary tab. If the column isn't one of the four named
        // sides, skip: partial highlights need a side to scope them.
        const side = sideFromElement(startBody);
        if (!side) return;
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
          translation: side,
          rect,
        });
      });
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [valid, work, book, chapterNum]);

  const annotations = useChapterAnnotations(work, book, chapterNum);

  // When the layout pairs an LXX-versified single column with an MT-versified
  // single column, swap LXX-versified columns onto MT chapter+verse numbering
  // so all columns line up by reference (see [[versification]]). Single Greek
  // alone, or a Greek+English interlinear, stays on LXX.
  const mtRemap = activeTabsRequireMTRemap(activeTabs);
  const versificationFor = (lang: CorpusLanguage): "native" | "mt" =>
    mtRemap && isLXXVersified(lang) ? "mt" : "native";

  // Check whether the book slug resolves to a real book. Runs before the chapter
  // queries so we can show NotFound immediately instead of the "Not available"
  // placeholder. Uses the primary language (with its fallback chain) as the
  // authority; a slug missing from every fallback is genuinely unknown.
  const primaryLang = activeLangs[0] ?? "en_bsb";
  const bookQuery = useQuery({
    queryKey: ["corpus", "book", primaryLang, book],
    queryFn: () => findBook(primaryLang, book),
    enabled: valid,
  });

  const chapterCountQuery = useQuery({
    queryKey: ["corpus", "chapterCount", primaryLang, book],
    queryFn: () => getChapterCount(primaryLang, book),
    enabled: valid && !bookQuery.isPending && bookQuery.data !== null,
  });

  // Fetch one chapter per active language. useQueries shares cache keys with
  // useChapter, so other consumers of the same (lang, book, chapter,
  // versification) tuple don't double-fetch.
  const chapterQueries = useQueries({
    queries: activeLangs.map((lang) => {
      const versification = versificationFor(lang);
      return {
        queryKey: ["corpus", "chapter", lang, book, chapterNum, versification],
        queryFn: () => getChapter(lang, book, chapterNum, { versification }),
      };
    }),
  });

  // The primary translation drives the chapter selector + nav (chapter list,
  // book name in primary language).
  const primaryQuery = chapterQueries[0];
  const chapterNumbers = primaryQuery?.data?.chapterNumbers ?? [];
  const primaryBookName = primaryQuery?.data?.book.name ?? null;
  const primaryChapterReady = Boolean(primaryQuery?.data);

  // Scroll to #vN anchor once the chapter data has rendered. Re-runs when the
  // primary chapter query settles so the target verse exists in the DOM —
  // verses on a remote backend can land well after the route changes, which
  // is why a pure rAF retry loop wasn't reliable.
  useEffect(() => {
    if (!location.hash) return;
    if (!primaryChapterReady) return;
    const id = location.hash.slice(1);
    let raf = 0;
    let attempts = 0;
    const tryScroll = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (attempts++ < 60) raf = requestAnimationFrame(tryScroll);
    };
    raf = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(raf);
  }, [location.hash, location.pathname, primaryChapterReady]);

  if (!valid) return <Navigate to="/reader/bible/john/1" replace />;
  if (!bookQuery.isPending && bookQuery.data === null) return <NotFoundRoute />;
  if (
    !chapterCountQuery.isPending &&
    chapterCountQuery.data !== null &&
    chapterCountQuery.data !== undefined &&
    chapterNum > chapterCountQuery.data
  ) return <NotFoundRoute />;

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
        tabs={activeTabs}
        chapters={chapterQueries.map((q) => q.data ?? null)}
        pending={chapterQueries.map((q) => q.isPending)}
        errors={chapterQueries.map((q) => q.error)}
        highlights={allHighlights}
        notes={allNotes}
        selection={selection}
        onSelectVerse={(n, side) =>
          setSelection(n === null ? null : { number: n, side: side ?? null })
        }
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
      {selection !== null && toolbarAnchor ? (
        <div
          role="dialog"
          aria-label={`Annotations for verse ${selection.number}`}
          data-scroll-trap
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
              verse: selection.number,
            }}
            side={selection.side}
            notes={allNotes.filter((n) => n.verse === selection.number)}
            onDone={() => setSelection(null)}
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
      {work === "bible" && audioLangs.length > 0 && audioBarEnabled ? (
        <AudioPlayer
          available={audioLangs}
          workSlug={work}
          bookSlug={book}
          chapter={chapterNum}
          nextChapter={(() => {
            const idx = chapterNumbers.indexOf(chapterNum);
            return idx >= 0 && idx < chapterNumbers.length - 1
              ? chapterNumbers[idx + 1] ?? null
              : null;
          })()}
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

/**
 * Walk up from a node to the nearest [data-column] (set by each rendered
 * column's chapter-flow wrapper). The column attribute holds the CorpusLanguage
 * the column was rendered with; sideOf folds that into one of the four
 * user-visible sides. Returns null for non-side columns (en_brenton, la) or
 * when no [data-column] ancestor exists.
 */
function sideFromElement(node: Node | null): SideKey | null {
  let n: Node | null = node;
  while (n) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement;
      const col = el.dataset?.column;
      if (col) return sideOf(col as CorpusLanguage);
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

function ColumnsLayout(props: {
  workSlug: string;
  bookSlug: string;
  chapterNum: number;
  tabs: Tab[];
  chapters: Array<ChapterPayload | null>;
  pending: boolean[];
  errors: Array<unknown>;
  highlights: HighlightRow[];
  notes: NoteRow[];
  selection: VerseSelection | null;
  onSelectVerse: (n: number | null, side: SideKey | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
  onOpenHighlight: (highlightId: string, rect: DOMRect) => void;
}) {
  const dropCapsEnabled = useSettingsStore((s) => s.dropCapsEnabled);
  if (props.tabs.length <= 1) {
    return <SingleTabLayout {...props} dropCapsEnabled={dropCapsEnabled} />;
  }
  return <MultiTabGrid {...props} />;
}

function SingleTabLayout({
  tabs,
  chapters,
  pending,
  errors,
  chapterNum,
  highlights,
  notes,
  selection,
  onSelectVerse,
  onOpenStrongs,
  onOpenHighlight,
  dropCapsEnabled,
}: {
  tabs: Tab[];
  chapters: Array<ChapterPayload | null>;
  pending: boolean[];
  errors: Array<unknown>;
  chapterNum: number;
  highlights: HighlightRow[];
  notes: NoteRow[];
  selection: VerseSelection | null;
  onSelectVerse: (n: number | null, side: SideKey | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
  onOpenHighlight: (highlightId: string, rect: DOMRect) => void;
  dropCapsEnabled: boolean;
}) {
  const tab = tabs[0];
  if (!tab) return null;
  if (tab.kind === "interlinear") {
    return (
      <InterlinearColumn
        primary={tab.primary}
        secondary={tab.secondary}
        chapter={chapters[0] ?? null}
        isPending={pending[0] ?? false}
        error={errors[0] ?? null}
        chapterNum={chapterNum}
        maxWidth="var(--measure)"
        highlights={highlights}
        notes={notes}
        selection={selection}
        onSelectVerse={onSelectVerse}
        onOpenStrongs={onOpenStrongs}
      />
    );
  }
  return (
    <Column
      language={tab.lang}
      chapter={chapters[0] ?? null}
      isPending={pending[0] ?? false}
      error={errors[0] ?? null}
      chapterNum={chapterNum}
      maxWidth="var(--measure)"
      highlights={highlights}
      notes={notes}
      selection={selection}
      onSelectVerse={onSelectVerse}
      onOpenStrongs={onOpenStrongs}
      onOpenHighlight={onOpenHighlight}
      dropCapsEnabled={dropCapsEnabled}
    />
  );
}

/**
 * Multi-tab comparison layout: one grid row per verse number, one column per
 * tab. Grid alignment guarantees that verse N starts on the same baseline in
 * every column — no measurement effects needed. Each cell is a block, so
 * verses stack vertically (one per line) within their column. Interlinear
 * tabs render their per-word gloss stack inline within their cell; single
 * tabs render the verse text via VerseInline.
 */
function MultiTabGrid({
  tabs,
  chapters,
  pending,
  errors,
  chapterNum,
  highlights,
  notes,
  selection,
  onSelectVerse,
  onOpenStrongs,
  onOpenHighlight,
}: {
  tabs: Tab[];
  chapters: Array<ChapterPayload | null>;
  pending: boolean[];
  errors: Array<unknown>;
  chapterNum: number;
  highlights: HighlightRow[];
  notes: NoteRow[];
  selection: VerseSelection | null;
  onSelectVerse: (n: number | null, side: SideKey | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
  onOpenHighlight: (highlightId: string, rect: DOMRect) => void;
}) {
  // Union of verse numbers across loaded columns, ascending. A verse missing
  // from a particular language renders as an empty cell in that column's row.
  const verseNumbers = useMemo(() => {
    const set = new Set<number>();
    for (const c of chapters) c?.verses.forEach((v) => set.add(v.number));
    return [...set].sort((a, b) => a - b);
  }, [chapters]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        columnGap: "2.5rem",
        rowGap: "0.75em",
        alignItems: "start",
      }}
    >
      {tabs.map((tab, colIdx) => (
        <TabColumnCells
          key={tab.kind === "single" ? `s:${tab.lang}:${colIdx}` : `i:${tab.primary}+${tab.secondary}:${colIdx}`}
          tab={tab}
          colIdx={colIdx}
          chapter={chapters[colIdx] ?? null}
          isPending={pending[colIdx] ?? false}
          error={errors[colIdx]}
          chapterNum={chapterNum}
          verseNumbers={verseNumbers}
          highlights={highlights}
          notes={notes}
          selection={selection}
          onSelectVerse={onSelectVerse}
          onOpenStrongs={onOpenStrongs}
          onOpenHighlight={onOpenHighlight}
        />
      ))}
    </div>
  );
}

/**
 * Emits one column's worth of grid cells: a header at row 1, then a cell per
 * verse number at row verseIdx+2. Returned as a React fragment so the cells
 * become direct children of the grid container. Pending/error/missing states
 * render once in the header cell; verse cells in those states stay empty so
 * the row heights track the columns that DO have content.
 */
function TabColumnCells({
  tab,
  colIdx,
  chapter,
  isPending,
  error,
  chapterNum,
  verseNumbers,
  highlights,
  notes,
  selection,
  onSelectVerse,
  onOpenStrongs,
  onOpenHighlight,
}: {
  tab: Tab;
  colIdx: number;
  chapter: ChapterPayload | null;
  isPending: boolean;
  error: unknown;
  chapterNum: number;
  verseNumbers: number[];
  highlights: HighlightRow[];
  notes: NoteRow[];
  selection: VerseSelection | null;
  onSelectVerse: (n: number | null, side: SideKey | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
  onOpenHighlight: (highlightId: string, rect: DOMRect) => void;
}) {
  const gridColumn = colIdx + 1;
  // The user-visible side this column represents — used both to scope
  // highlights/bookmarks to the column the user clicked and to label the
  // cell's data-verse-cell-side attribute so the toolbar anchors here.
  const colSide = sideOf(tab.kind === "single" ? tab.lang : tab.primary);
  const label =
    tab.kind === "single"
      ? translationShortLabel(tab.lang)
      : interlinearLabel(tab.primary, tab.secondary);

  const headerCell = (
    <div
      key="h"
      style={{ gridColumn, gridRow: 1, minWidth: 0, display: "block" }}
    >
      <header style={{ marginBottom: "1.25rem" }}>
        <p className="al-eyebrow">{label}</p>
        <p className="al-chapter-label" style={{ marginTop: 4 }}>
          {chapter
            ? `${chapter.book.name} · Chapter ${toRoman(chapterNum)}`
            : "—"}
        </p>
      </header>
      {isPending ? (
        <p style={{ color: "var(--color-fg-muted)" }}>Loading…</p>
      ) : error ? (
        <pre style={{ color: "var(--color-accent)" }}>{String(error)}</pre>
      ) : !chapter ? (
        <p style={{ color: "var(--color-fg-subtle)", fontStyle: "italic" }}>
          Not available
          {tab.kind === "single" ? ` in ${translationShortLabel(tab.lang)}` : ""}.
        </p>
      ) : null}
    </div>
  );

  return (
    <>
      {headerCell}
      {verseNumbers.map((n, rowIdx) => {
        const gridRow = rowIdx + 2;
        const verse = chapter?.verses.find((v) => v.number === n);
        if (!chapter || !verse) {
          return (
            <div
              key={`v:${n}`}
              style={{ gridColumn, gridRow, minWidth: 0, display: "block" }}
            />
          );
        }
        const isSelected =
          selection?.number === n && selection?.side === colSide;
        return (
          <div
            key={`v:${n}`}
            data-verse-cell={n}
            data-verse-cell-side={colSide ?? undefined}
            data-column={tab.kind === "single" ? tab.lang : tab.primary}
            style={{ gridColumn, gridRow, minWidth: 0, display: "block" }}
          >
            {tab.kind === "single" ? (
              <SingleVerseCell
                tab={tab}
                verse={verse}
                words={chapter.wordsByVerse[verse.id]}
                side={colSide}
                isSelected={isSelected}
                highlights={highlights}
                notes={notes}
                onSelectVerse={onSelectVerse}
                onOpenStrongs={onOpenStrongs}
                onOpenHighlight={onOpenHighlight}
              />
            ) : (
              <InterlinearVerseCell
                tab={tab}
                verse={verse}
                words={chapter.wordsByVerse[verse.id] ?? []}
                side={colSide}
                isSelected={isSelected}
                highlights={highlights}
                notes={notes}
                onSelectVerse={onSelectVerse}
                onOpenStrongs={onOpenStrongs}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function SingleVerseCell({
  tab,
  verse,
  words,
  side,
  isSelected,
  highlights,
  notes,
  onSelectVerse,
  onOpenStrongs,
  onOpenHighlight,
}: {
  tab: SingleTab;
  verse: VerseRow;
  words: WordRow[] | undefined;
  side: SideKey | null;
  isSelected: boolean;
  highlights: HighlightRow[];
  notes: NoteRow[];
  onSelectVerse: (n: number | null, side: SideKey | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
  onOpenHighlight: (highlightId: string, rect: DOMRect) => void;
}) {
  const verseHls = highlights.filter(
    (h) =>
      h.verse === verse.number &&
      (h.translation === null || h.translation === side),
  );
  const verseNotes = notes.filter((n) => n.verse === verse.number);
  return (
    <span lang={LANG_ATTR[tab.lang]}>
      <VerseInline
        verse={verse}
        words={words}
        language={tab.lang}
        withDropCap={false}
        highlights={verseHls}
        notes={verseNotes}
        selected={isSelected}
        onSelect={() => onSelectVerse(isSelected ? null : verse.number, side)}
        onOpenStrongs={onOpenStrongs}
        onOpenHighlight={onOpenHighlight}
      />
    </span>
  );
}

function InterlinearVerseCell({
  tab,
  verse,
  words,
  side,
  isSelected,
  highlights,
  notes,
  onSelectVerse,
  onOpenStrongs,
}: {
  tab: InterlinearTab;
  verse: VerseRow;
  words: WordRow[];
  side: SideKey | null;
  isSelected: boolean;
  highlights: HighlightRow[];
  notes: NoteRow[];
  onSelectVerse: (n: number | null, side: SideKey | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
}) {
  const tokenLang: "he" | "grc" = tab.primary === "he" ? "he" : "grc";
  const rtl = tab.primary === "he";
  // Verse-level highlights apply (universal + this side's). Partial highlights
  // never render here — the visible tokens are primary-language words, so the
  // character offsets from a secondary-language highlight wouldn't line up.
  const verseHls = highlights.filter(
    (h) =>
      h.verse === verse.number &&
      h.start_token == null &&
      (h.translation === null || h.translation === side),
  );
  const hl = verseHls[0];
  const hasNote = notes.some((n) => n.verse === verse.number);
  // Highlight tints only primary-text spans (verse number + each surface
  // token), never the gloss row beneath each word — matches the normal-side
  // rule that highlights cover only primary text.
  const hlClass = hl ? `al-hl al-hl-${hl.color}` : null;
  const wrapperClass = [
    "al-verse-inline",
    "al-il-verse",
    isSelected ? "al-verse-selected" : null,
    hasNote ? "al-verse-noted" : null,
  ]
    .filter(Boolean)
    .join(" ");
  const vnumClass = ["al-verse-num-inline", "al-il-vnum", hlClass]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className="al-il-flow"
      lang={tokenLang}
      dir={rtl ? "rtl" : "ltr"}
      style={{ display: "block" }}
    >
      <span
        className={wrapperClass}
        data-verse-text={verse.number}
        lang={tokenLang}
        onClick={() => onSelectVerse(isSelected ? null : verse.number, side)}
        style={{ cursor: "pointer" }}
      >
        <sup
          id={`v${verse.number}`}
          data-verse-anchor={verse.number}
          className={vnumClass}
        >
          {verse.number}
        </sup>
        <span data-verse-body={verse.number} className="al-il-body">
          {words.length > 0
            ? words.map((w, i) => {
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
              ? <span className={hlClass}>{verse.text_plain}</span>
              : verse.text_plain}
        </span>
      </span>
    </span>
  );
}

function Column({
  language,
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
  onOpenHighlight,
  dropCapsEnabled,
}: {
  language: CorpusLanguage;
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
  onOpenHighlight: (highlightId: string, rect: DOMRect) => void;
  dropCapsEnabled: boolean;
}) {
  const colSide = sideOf(language);
  if (isPending) {
    return (
      <section style={{ maxWidth, minWidth: 0 }}>
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
      <section style={{ maxWidth, minWidth: 0 }}>
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
      <section style={{ maxWidth, minWidth: 0 }}>
        <ColumnHeading
          language={language}
          bookName={null}
          chapterNum={chapterNum}
        />
        <p style={{ color: "var(--color-fg-subtle)", fontStyle: "italic" }}>
          Not available in {translationShortLabel(language)}.
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
          // partial highlights are scoped to the side they were created on so
          // they don't bleed across columns. en_bsb + en_web both fold into
          // the same "en_modern" side via sideOf.
          const verseHls = highlights.filter(
            (h) =>
              h.verse === v.number &&
              (h.translation === null || h.translation === colSide),
          );
          const verseNotes = notes.filter((n) => n.verse === v.number);
          const isSelected =
            selection?.number === v.number && selection?.side === colSide;
          // Source-faithful paragraph spacing: when the verse's USFM lead
          // marker indicates a paragraph or poetic-line start, insert a block
          // break before it. Suppressed for the first verse of the chapter
          // (the chapter heading already provides a section break).
          const lead = i > 0 ? v.lead : null;
          return (
            <Fragment key={v.id}>
              {lead && (
                <span
                  className={`al-paragraph-lead al-paragraph-lead--${lead}`}
                  data-lead={lead}
                  aria-hidden="true"
                />
              )}
              <VerseInline
                verse={v}
                words={wordsByVerse[v.id]}
                language={language}
                withDropCap={i === 0 && chapterNum === 1 && dropCapsEnabled}
                highlights={verseHls}
                notes={verseNotes}
                selected={isSelected}
                onSelect={() =>
                  onSelectVerse(isSelected ? null : v.number, colSide)
                }
                onOpenStrongs={onOpenStrongs}
                onOpenHighlight={onOpenHighlight}
              />
            </Fragment>
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
      <p className="al-eyebrow">{translationShortLabel(language)}</p>
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
