// One chapter in the continuous-scroll reader.
//
// ReaderRoute composes a vertical stack of these (see useChapterStack.ts). Each
// ChapterSection is self-contained: it fans out its own per-translation chapter
// queries and its own annotations query, then renders the column layout that
// the old single-chapter ReaderRoute used to render inline. Lifting this into a
// component is what lets ReaderRoute render a *list* of chapters.
//
// Cross-cutting state (the current text selection, the highlight/strongs/verse
// popovers) still lives in ReaderRoute — a single popover layer for the whole
// page — and is threaded down through optional callbacks. The section tags its
// root element with `data-chapter-section` + the chapter's work/book/chapter so
// ReaderRoute's document-level mouseup handler can recover which chapter a text
// selection landed in (and reject selections that span two chapters; see spec
// AC #8).

import { Fragment, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { getChapter, type ChapterPayload } from "@/db/queries";
import { useChapterAnnotations } from "@/db/userHooks";
import type {
  CorpusLanguage,
  HighlightRow,
  NoteRow,
  VerseRow,
  WordRow,
} from "@/db/types";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { translationShortLabel } from "@/domain/translations";
import { bookDisplayName } from "@/domain/reference";
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
import { VerseInline } from "./VerseInline";
import { InterlinearWord } from "./InterlinearWord";
import { InterlinearColumn } from "./InterlinearColumn";
import { toRoman } from "./roman";
import { useViewportWidth } from "@/lib/useViewportWidth";
import {
  chapterKeyId,
  sameKey,
  type ChapterKey,
} from "./useChapterStack";

const LANG_ATTR: Partial<Record<CorpusLanguage, string>> = {
  he: "he",
  gk: "grc",
  la: "la",
};

/** A live verse selection, scoped to the chapter it lives in. */
export interface ReaderSelection {
  key: ChapterKey;
  number: number;
  side: SideKey | null;
}

export interface ChapterSectionProps {
  chapterKey: ChapterKey;
  /** First chapter in the stack — no top divider rule, drop-cap on verse 1. */
  isFirst?: boolean;
  selection?: ReaderSelection | null;
  onSelectVerse?: (
    key: ChapterKey,
    n: number | null,
    side: SideKey | null,
  ) => void;
  onOpenStrongs?: (id: string, rect: DOMRect) => void;
  /** Receives the full highlight row (looked up from this chapter's data). */
  onOpenHighlight?: (highlight: HighlightRow, rect: DOMRect) => void;
  /** Register/unregister the section root so ReaderRoute can observe it for
   *  append/prepend, current-chapter derivation, and scroll-anchor capture. */
  registerEl?: (id: string, el: HTMLElement | null) => void;
}

const noop = () => {};

export function ChapterSection({
  chapterKey,
  isFirst = false,
  selection = null,
  onSelectVerse = noop,
  onOpenStrongs = noop,
  onOpenHighlight = noop,
  registerEl,
}: ChapterSectionProps) {
  const { workSlug, bookSlug, chapter: chapterNum } = chapterKey;

  const tabs = useSettingsStore((s) => s.tabs);
  const dropCapsEnabled = useSettingsStore((s) => s.dropCapsEnabled);
  const activeTabs = tabs.filter((t) => t.active);
  const activeLangs: CorpusLanguage[] = activeTabs.map((t) =>
    t.kind === "single" ? t.lang : t.primary,
  );

  // Same MT-remap rule as the old ReaderRoute: pairing an LXX-versified single
  // column with an MT-versified one snaps the LXX column onto MT numbering.
  const mtRemap = activeTabsRequireMTRemap(activeTabs);
  const versificationFor = (lang: CorpusLanguage): "native" | "mt" =>
    mtRemap && isLXXVersified(lang) ? "mt" : "native";

  // One query per active language — shares cache keys with useChapter so a
  // chapter revisited within the session (or already loaded by a neighbouring
  // section) is an instant cache hit.
  const chapterQueries = useQueries({
    queries: activeLangs.map((lang) => {
      const versification = versificationFor(lang);
      return {
        queryKey: ["corpus", "chapter", lang, bookSlug, chapterNum, versification],
        queryFn: () => getChapter(lang, bookSlug, chapterNum, { versification }),
      };
    }),
  });

  const annotations = useChapterAnnotations(workSlug, bookSlug, chapterNum);
  const highlights = annotations.data?.highlights ?? [];
  const notes = annotations.data?.notes ?? [];

  const primaryQuery = chapterQueries[0];
  const loadedBookName = primaryQuery?.data?.book.name ?? null;
  // Prefer the loaded name; fall back to the static map so the heading reads
  // "Genesis · Chapter I" while the chapter is still loading instead of "—".
  const headingName = loadedBookName ?? bookDisplayName(bookSlug);

  const handleOpenHighlight = (highlightId: string, rect: DOMRect) => {
    const h = highlights.find((x) => x.id === highlightId);
    if (h) onOpenHighlight(h, rect);
  };

  const columnProps = {
    workSlug,
    bookSlug,
    chapterKey,
    chapterNum,
    fallbackBookName: headingName,
    tabs: activeTabs,
    chapters: chapterQueries.map((q) => q.data ?? null),
    pending: chapterQueries.map((q) => q.isPending),
    errors: chapterQueries.map((q) => q.error),
    highlights,
    notes,
    selection,
    onSelectVerse: (n: number | null, side: SideKey | null) =>
      onSelectVerse(chapterKey, n, side),
    onOpenStrongs,
    onOpenHighlight: handleOpenHighlight,
    dropCapsEnabled,
  };

  return (
    <section
      ref={(el) => registerEl?.(chapterKeyId(chapterKey), el)}
      data-chapter-section
      data-section-key={chapterKeyId(chapterKey)}
      data-section-work={workSlug}
      data-section-book={bookSlug}
      data-section-chapter={chapterNum}
      style={{
        borderTop: isFirst ? undefined : "1px solid var(--color-rule)",
        paddingTop: isFirst ? undefined : "2.5rem",
        marginTop: isFirst ? undefined : "2.5rem",
      }}
    >
      <ColumnsLayout {...columnProps} />
    </section>
  );
}

interface ColumnsLayoutProps {
  workSlug: string;
  bookSlug: string;
  chapterKey: ChapterKey;
  chapterNum: number;
  fallbackBookName: string;
  tabs: Tab[];
  chapters: Array<ChapterPayload | null>;
  pending: boolean[];
  errors: Array<unknown>;
  highlights: HighlightRow[];
  notes: NoteRow[];
  selection: ReaderSelection | null;
  onSelectVerse: (n: number | null, side: SideKey | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
  onOpenHighlight: (highlightId: string, rect: DOMRect) => void;
  dropCapsEnabled: boolean;
}

function ColumnsLayout(props: ColumnsLayoutProps) {
  if (props.tabs.length <= 1) {
    return <SingleTabLayout {...props} />;
  }
  return <MultiTabGrid {...props} />;
}

/** True when this verse is the active selection within this chapter. */
function isSelectedVerse(
  selection: ReaderSelection | null,
  chapterKey: ChapterKey,
  number: number,
  side: SideKey | null,
): boolean {
  return (
    !!selection &&
    sameKey(selection.key, chapterKey) &&
    selection.number === number &&
    selection.side === side
  );
}

function SingleTabLayout({
  tabs,
  chapters,
  pending,
  errors,
  chapterKey,
  chapterNum,
  fallbackBookName,
  highlights,
  notes,
  selection,
  onSelectVerse,
  onOpenStrongs,
  onOpenHighlight,
  dropCapsEnabled,
}: ColumnsLayoutProps) {
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
        selection={legacySelection(selection, chapterKey)}
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
      chapterKey={chapterKey}
      chapterNum={chapterNum}
      fallbackBookName={fallbackBookName}
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

// InterlinearColumn pre-dates the chapter-scoped selection; it only cares about
// {number, side}. Down-convert, scoping to this chapter so a selection in a
// different loaded chapter doesn't light up here.
function legacySelection(
  selection: ReaderSelection | null,
  chapterKey: ChapterKey,
): { number: number; side: SideKey | null } | null {
  if (!selection || !sameKey(selection.key, chapterKey)) return null;
  return { number: selection.number, side: selection.side };
}

function MultiTabGrid({
  tabs,
  chapters,
  pending,
  errors,
  chapterKey,
  chapterNum,
  fallbackBookName,
  highlights,
  notes,
  selection,
  onSelectVerse,
  onOpenStrongs,
  onOpenHighlight,
}: ColumnsLayoutProps) {
  const verseNumbers = useMemo(() => {
    const set = new Set<number>();
    for (const c of chapters) c?.verses.forEach((v) => set.add(v.number));
    return [...set].sort((a, b) => a - b);
  }, [chapters]);

  // Below ~520px, N side-by-side columns are unreadable (4 tabs ≈ 60–90px
  // each) and a long unbreakable Hebrew/Greek word paints straight over the
  // neighbouring column. Stack the translations per verse instead — the
  // layout every mobile parallel Bible converges on. Desktop and tablet are
  // untouched.
  const stacked = useViewportWidth() < 520 && tabs.length > 1;
  if (stacked) {
    return (
      <StackedVerses
        tabs={tabs}
        chapters={chapters}
        pending={pending}
        errors={errors}
        chapterKey={chapterKey}
        chapterNum={chapterNum}
        fallbackBookName={fallbackBookName}
        verseNumbers={verseNumbers}
        highlights={highlights}
        notes={notes}
        selection={selection}
        onSelectVerse={onSelectVerse}
        onOpenStrongs={onOpenStrongs}
        onOpenHighlight={onOpenHighlight}
      />
    );
  }

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
          key={
            tab.kind === "single"
              ? `s:${tab.lang}:${colIdx}`
              : `i:${tab.primary}+${tab.secondary}:${colIdx}`
          }
          tab={tab}
          colIdx={colIdx}
          chapter={chapters[colIdx] ?? null}
          isPending={pending[colIdx] ?? false}
          error={errors[colIdx]}
          chapterKey={chapterKey}
          chapterNum={chapterNum}
          fallbackBookName={fallbackBookName}
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

function TabColumnCells({
  tab,
  colIdx,
  chapter,
  isPending,
  error,
  chapterKey,
  chapterNum,
  fallbackBookName,
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
  chapterKey: ChapterKey;
  chapterNum: number;
  fallbackBookName: string;
  verseNumbers: number[];
  highlights: HighlightRow[];
  notes: NoteRow[];
  selection: ReaderSelection | null;
  onSelectVerse: (n: number | null, side: SideKey | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
  onOpenHighlight: (highlightId: string, rect: DOMRect) => void;
}) {
  const gridColumn = colIdx + 1;
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
          {`${chapter?.book.name ?? fallbackBookName} · Chapter ${toRoman(chapterNum)}`}
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
        const isSelected = isSelectedVerse(selection, chapterKey, n, colSide);
        return (
          <div
            key={`v:${n}`}
            data-verse-cell={n}
            data-verse-cell-side={colSide ?? undefined}
            data-column={tab.kind === "single" ? tab.lang : tab.primary}
            style={{
              gridColumn,
              gridRow,
              minWidth: 0,
              display: "block",
              // A long Hebrew/Greek token must break rather than paint over
              // the neighbouring column when the columns get narrow.
              overflowWrap: "break-word",
            }}
          >
            <VerseCell
              tab={tab}
              colSide={colSide}
              verse={verse}
              words={chapter.wordsByVerse[verse.id]}
              isSelected={isSelected}
              highlights={highlights}
              notes={notes}
              onSelectVerse={onSelectVerse}
              onOpenStrongs={onOpenStrongs}
              onOpenHighlight={onOpenHighlight}
            />
          </div>
        );
      })}
    </>
  );
}

/** The single/interlinear branch shared by the grid and stacked layouts. */
function VerseCell({
  tab,
  colSide,
  verse,
  words,
  isSelected,
  highlights,
  notes,
  onSelectVerse,
  onOpenStrongs,
  onOpenHighlight,
}: {
  tab: Tab;
  colSide: SideKey | null;
  verse: VerseRow;
  words: WordRow[] | undefined;
  isSelected: boolean;
  highlights: HighlightRow[];
  notes: NoteRow[];
  onSelectVerse: (n: number | null, side: SideKey | null) => void;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
  onOpenHighlight: (highlightId: string, rect: DOMRect) => void;
}) {
  return tab.kind === "single" ? (
    <SingleVerseCell
      tab={tab}
      verse={verse}
      words={words}
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
      words={words ?? []}
      side={colSide}
      isSelected={isSelected}
      highlights={highlights}
      notes={notes}
      onSelectVerse={onSelectVerse}
      onOpenStrongs={onOpenStrongs}
    />
  );
}

/**
 * Phone layout for multiple open translations: one column, the translations
 * stacked under each verse with a small tag identifying each rendering. One
 * combined chapter header replaces the per-column headers; per-tab loading /
 * error / not-available states render as compact lines under it.
 */
function StackedVerses({
  tabs,
  chapters,
  pending,
  errors,
  chapterKey,
  chapterNum,
  fallbackBookName,
  verseNumbers,
  highlights,
  notes,
  selection,
  onSelectVerse,
  onOpenStrongs,
  onOpenHighlight,
}: Omit<ColumnsLayoutProps, "workSlug" | "bookSlug" | "dropCapsEnabled"> & {
  verseNumbers: number[];
}) {
  const bookName =
    chapters.find((c) => c !== null)?.book.name ?? fallbackBookName;
  const labelFor = (tab: Tab) =>
    tab.kind === "single"
      ? translationShortLabel(tab.lang)
      : interlinearLabel(tab.primary, tab.secondary);

  return (
    <div>
      <header style={{ marginBottom: "1.25rem" }}>
        <p className="al-eyebrow">{tabs.map(labelFor).join(" · ")}</p>
        <p className="al-chapter-label" style={{ marginTop: 4 }}>
          {`${bookName} · Chapter ${toRoman(chapterNum)}`}
        </p>
      </header>
      {tabs.map((tab, i) =>
        pending[i] ? (
          <p key={`s:${i}`} style={{ color: "var(--color-fg-muted)" }}>
            {labelFor(tab)}: loading…
          </p>
        ) : errors[i] ? (
          <pre key={`s:${i}`} style={{ color: "var(--color-accent)" }}>
            {`${labelFor(tab)}: ${String(errors[i])}`}
          </pre>
        ) : !chapters[i] ? (
          <p
            key={`s:${i}`}
            style={{ color: "var(--color-fg-subtle)", fontStyle: "italic" }}
          >
            Not available in {labelFor(tab)}.
          </p>
        ) : null,
      )}
      {verseNumbers.map((n) => (
        <div
          key={`v:${n}`}
          style={{
            marginBottom: "1.1em",
            paddingBottom: "0.35em",
            borderBottom: "1px solid var(--color-rule)",
          }}
        >
          {tabs.map((tab, colIdx) => {
            const chapter = chapters[colIdx];
            const verse = chapter?.verses.find((v) => v.number === n);
            if (!chapter || !verse) return null;
            const colSide = sideOf(
              tab.kind === "single" ? tab.lang : tab.primary,
            );
            const isSelected = isSelectedVerse(
              selection,
              chapterKey,
              n,
              colSide,
            );
            return (
              <div
                key={
                  tab.kind === "single"
                    ? `s:${tab.lang}:${colIdx}`
                    : `i:${tab.primary}+${tab.secondary}:${colIdx}`
                }
                data-verse-cell={n}
                data-verse-cell-side={colSide ?? undefined}
                data-column={tab.kind === "single" ? tab.lang : tab.primary}
                style={{
                  minWidth: 0,
                  overflowWrap: "break-word",
                  marginBottom: "0.45em",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--color-fg-subtle)",
                    marginBottom: 1,
                    // The tag reads left-to-right even above RTL Hebrew.
                    direction: "ltr",
                  }}
                >
                  {labelFor(tab)}
                </span>
                <VerseCell
                  tab={tab}
                  colSide={colSide}
                  verse={verse}
                  words={chapter.wordsByVerse[verse.id]}
                  isSelected={isSelected}
                  highlights={highlights}
                  notes={notes}
                  onSelectVerse={onSelectVerse}
                  onOpenStrongs={onOpenStrongs}
                  onOpenHighlight={onOpenHighlight}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
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
  const verseHls = highlights.filter(
    (h) =>
      h.verse === verse.number &&
      h.start_token == null &&
      (h.translation === null || h.translation === side),
  );
  const hl = verseHls[0];
  const hasNote = notes.some((n) => n.verse === verse.number);
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
        <sup data-verse-anchor={verse.number} className={vnumClass}>
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
  chapterKey,
  chapterNum,
  fallbackBookName,
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
  chapterKey: ChapterKey;
  chapterNum: number;
  fallbackBookName: string;
  maxWidth: string;
  highlights: HighlightRow[];
  notes: NoteRow[];
  selection: ReaderSelection | null;
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
          bookName={fallbackBookName}
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
          bookName={fallbackBookName}
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
          bookName={fallbackBookName}
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
          const verseHls = highlights.filter(
            (h) =>
              h.verse === v.number &&
              (h.translation === null || h.translation === colSide),
          );
          const verseNotes = notes.filter((n) => n.verse === v.number);
          const isSelected = isSelectedVerse(
            selection,
            chapterKey,
            v.number,
            colSide,
          );
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
