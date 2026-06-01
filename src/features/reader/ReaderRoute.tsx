import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./verseFlash.css";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams, Navigate } from "react-router-dom";
import { findBook, getChapterCount } from "@/db/queries";
import { useCanon } from "@/db/hooks";
import {
  useChapterAnnotations,
  useCreateHighlight,
  useDeleteHighlight,
} from "@/db/userHooks";
import type { CorpusLanguage, HighlightRow } from "@/db/types";
import { kvSet } from "@/db/user";
import { onAnyScroll } from "@/lib/onScroll";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { SideKey } from "@/domain/sides";
import { sideOf } from "@/domain/sides";
import { bookDisplayName } from "@/domain/reference";
import { NotFoundRoute } from "@/features/notFound/NotFoundRoute";
import { StrongsPopover } from "@/features/lexicon/StrongsPopover";
import { VerseToolbar } from "./VerseToolbar";
import { HighlightPopover, type HighlightUiState } from "./HighlightPopover";
import { ChapterNav } from "./ChapterNav";
import { ChapterPicker } from "./ChapterPicker";
import { AudioPlayer } from "./AudioPlayer";
import { isAudioTranslation, type AudioTranslation } from "@/domain/audio";
import { LanguageToggle } from "./LanguageToggle";
import { ChapterSection, type ReaderSelection } from "./ChapterSection";
import {
  chapterKeyId,
  nextChapterKey,
  prevChapterKey,
  sameKey,
  useChapterStack,
  MAX_CHAPTERS,
  type Canon,
  type ChapterKey,
} from "./useChapterStack";

interface StrongsState {
  id: string;
  rect: DOMRect;
}

/** Legacy per-chapter selection shape consumed by InterlinearColumn. The
 *  continuous-scroll reader tracks selection with chapter scope (see
 *  `ReaderSelection` in ChapterSection); this is the down-converted view. */
export interface VerseSelection {
  number: number;
  side: SideKey | null;
}

// How close (px) the user must scroll to a stack edge before we pull in the
// neighbouring chapter. Implemented as IntersectionObserver rootMargin, not a
// scroll listener (spec constraint).
const EDGE_MARGIN_PX = 600;
// URL-sync / current-chapter recompute cap: at most 4× per second.
const SYNC_THROTTLE_MS = 250;

export function ReaderRoute() {
  const { work = "", book = "", chapter = "" } = useParams();
  const chapterNum = Number(chapter);
  const valid = Boolean(
    work && book && Number.isFinite(chapterNum) && chapterNum >= 1,
  );
  const location = useLocation();

  const tabs = useSettingsStore((s) => s.tabs);
  const audioBarEnabled = useSettingsStore((s) => s.audioBarEnabled);
  const activeTabs = tabs.filter((t) => t.active);
  const activeLangs: CorpusLanguage[] = activeTabs.map((t) =>
    t.kind === "single" ? t.lang : t.primary,
  );
  const primaryLang = activeLangs[0] ?? "en_bsb";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLangs.join(",")]);

  // ── Chapter stack ────────────────────────────────────────────────────────
  const initialKey: ChapterKey = useMemo(
    () => ({ workSlug: work, bookSlug: book, chapter: chapterNum }),
    // Only the first render's params seed the stack; later navigation drives a
    // reset dispatch instead (see the navigation effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [stack, dispatch] = useChapterStack(initialKey, MAX_CHAPTERS);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const canonQuery = useCanon(primaryLang);
  const canon: Canon | null = canonQuery.data ?? null;
  const canonRef = useRef<Canon | null>(canon);
  canonRef.current = canon;

  // ── Current (largest-visible) chapter — drives URL, audio, picker, nav ─────
  const [currentKey, setCurrentKey] = useState<ChapterKey>(initialKey);
  const currentKeyRef = useRef(currentKey);
  currentKeyRef.current = currentKey;

  // ── Popover / selection state (single layer for the whole page) ────────────
  const [strongs, setStrongs] = useState<StrongsState | null>(null);
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [toolbarAnchor, setToolbarAnchor] = useState<
    { top: number; left: number; width: number; placement: "below" | "above" } | null
  >(null);
  const [hlUi, setHlUi] = useState<HighlightUiState | null>(null);
  const createHl = useCreateHighlight();
  const deleteHl = useDeleteHighlight();

  // Notes for the selected verse (shared cache key with the section's own
  // annotations query, so this doesn't double-fetch).
  const selAnnotations = useChapterAnnotations(
    selection?.key.workSlug ?? "",
    selection?.key.bookSlug ?? "",
    selection?.key.chapter ?? NaN,
  );
  const selNotes = selAnnotations.data?.notes ?? [];

  // ── Section element registry (for observers + scroll-anchor capture) ───────
  const sectionEls = useRef<Map<string, HTMLElement>>(new Map());
  const articleRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const getScroller = useCallback((): HTMLElement | null => {
    if (!scrollerRef.current) {
      scrollerRef.current =
        articleRef.current?.closest("main") ?? null;
    }
    return scrollerRef.current;
  }, []);

  // Set just before any stack mutation that changes content *above* the
  // viewport (prepend, or an append that drops the topmost chapter). The
  // layout effect below restores the anchor chapter to its pre-mutation
  // viewport position so the page doesn't jump.
  const anchorAdjustRef = useRef<{ key: string; top: number } | null>(null);
  const captureAnchor = useCallback(() => {
    const key = chapterKeyId(currentKeyRef.current);
    const el = sectionEls.current.get(key);
    anchorAdjustRef.current = el
      ? { key, top: el.getBoundingClientRect().top }
      : null;
  }, []);

  useLayoutEffect(() => {
    const pending = anchorAdjustRef.current;
    if (!pending) return;
    anchorAdjustRef.current = null;
    const el = sectionEls.current.get(pending.key);
    const scroller = getScroller();
    if (!el || !scroller) return;
    const delta = el.getBoundingClientRect().top - pending.top;
    if (delta !== 0) scroller.scrollTop += delta;
  }, [stack.chapters, getScroller]);

  // Tracks which section keys are currently intersecting the viewport — used to
  // avoid dropping (or scrolling past) a chapter that's still on screen.
  const visibleKeys = useRef<Set<string>>(new Set());
  // Per-section latest IntersectionObserver entry, for the current-chapter pick.
  const entryMap = useRef<Map<string, IntersectionObserverEntry>>(new Map());
  const userScrolled = useRef(false);
  const prependInFlight = useRef<Set<string>>(new Set());

  // ── Append / prepend triggers ──────────────────────────────────────────────
  const tryAppend = useCallback(() => {
    const c = canonRef.current;
    if (!c) return;
    const chapters = stackRef.current.chapters;
    const bottom = chapters[chapters.length - 1];
    if (!bottom) return;
    const next = nextChapterKey(bottom, c);
    if (!next) return; // end of canon
    if (chapters.some((k) => sameKey(k, next))) return;
    // If at cap, appending drops the topmost chapter. Don't drop one that's
    // still visible (e.g. a comically tall window). Spec AC #4.
    if (chapters.length >= stackRef.current.cap) {
      const top = chapters[0];
      if (top && visibleKeys.current.has(chapterKeyId(top))) return;
    }
    captureAnchor();
    dispatch({ type: "append", key: next });
  }, [captureAnchor, dispatch]);

  const tryPrepend = useCallback(() => {
    if (!userScrolled.current) return; // never prepend before the user scrolls
    const c = canonRef.current;
    if (!c) return;
    const chapters = stackRef.current.chapters;
    const top = chapters[0];
    if (!top) return;
    const prev = prevChapterKey(top, c);
    if (!prev) return; // before Genesis 1
    const prevId = chapterKeyId(prev);
    if (chapters.some((k) => sameKey(k, prev))) return;
    if (prependInFlight.current.has(prevId)) return;
    // If at cap, prepending drops the bottommost chapter; don't drop a visible one.
    if (chapters.length >= stackRef.current.cap) {
      const bottom = chapters[chapters.length - 1];
      if (bottom && visibleKeys.current.has(chapterKeyId(bottom))) return;
    }
    captureAnchor();
    dispatch({ type: "prepend", key: prev });
    // The section will mount and load its own data; the anchor adjustment in
    // the layout effect keeps the viewport stable across the height it adds.
    prependInFlight.current.add(prevId);
    // Clear the in-flight marker once it has landed in the stack (next tick).
    queueMicrotask(() => prependInFlight.current.delete(prevId));
  }, [captureAnchor, dispatch]);

  // ── Current-chapter derivation (URL sync + audio + picker/nav) ─────────────
  const lastSyncAt = useRef(0);
  const syncTimer = useRef<number | undefined>(undefined);
  const recomputeCurrent = useCallback(() => {
    let best: { key: ChapterKey; score: number; top: number } | null = null;
    const byId = new Map<string, ChapterKey>(
      stackRef.current.chapters.map((k) => [chapterKeyId(k), k]),
    );
    for (const [id, entry] of entryMap.current) {
      const key = byId.get(id);
      if (!key) continue;
      const score = entry.intersectionRatio * entry.intersectionRect.height;
      const top = entry.boundingClientRect.top;
      if (
        !best ||
        score > best.score ||
        (score === best.score && top < best.top)
      ) {
        best = { key, score, top };
      }
    }
    if (best && best.score > 0 && !sameKey(best.key, currentKeyRef.current)) {
      setCurrentKey(best.key);
    }
  }, []);
  const scheduleSync = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastSyncAt.current;
    if (elapsed >= SYNC_THROTTLE_MS) {
      lastSyncAt.current = now;
      recomputeCurrent();
    } else if (syncTimer.current === undefined) {
      syncTimer.current = window.setTimeout(() => {
        syncTimer.current = undefined;
        lastSyncAt.current = Date.now();
        recomputeCurrent();
      }, SYNC_THROTTLE_MS - elapsed);
    }
  }, [recomputeCurrent]);

  // The observer that tracks per-section visibility. Created once; sections
  // register/unregister their root elements as they mount/unmount.
  const sectionObserver = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          const id = el.dataset.sectionKey;
          if (!id) continue;
          entryMap.current.set(id, e);
          if (e.isIntersecting) visibleKeys.current.add(id);
          else visibleKeys.current.delete(id);
        }
        scheduleSync();
      },
      { root: getScroller(), threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    sectionObserver.current = obs;
    // Observe any sections already mounted.
    for (const el of sectionEls.current.values()) obs.observe(el);
    return () => {
      obs.disconnect();
      sectionObserver.current = null;
    };
  }, [getScroller, scheduleSync]);

  const registerEl = useCallback((id: string, el: HTMLElement | null) => {
    const map = sectionEls.current;
    const prev = map.get(id);
    if (prev && prev !== el) {
      sectionObserver.current?.unobserve(prev);
      entryMap.current.delete(id);
      visibleKeys.current.delete(id);
    }
    if (el) {
      map.set(id, el);
      sectionObserver.current?.observe(el);
    } else if (prev) {
      map.delete(id);
    }
  }, []);

  // Edge sentinels: pre-load the neighbour when the user scrolls within
  // EDGE_MARGIN_PX of either end of the stack.
  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const top = topSentinel.current;
    const bottom = bottomSentinel.current;
    if (!top && !bottom) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (e.target === bottomSentinel.current) tryAppend();
          else if (e.target === topSentinel.current) tryPrepend();
        }
      },
      {
        root: getScroller(),
        rootMargin: `${EDGE_MARGIN_PX}px 0px ${EDGE_MARGIN_PX}px 0px`,
      },
    );
    if (top) obs.observe(top);
    if (bottom) obs.observe(bottom);
    return () => obs.disconnect();
  }, [getScroller, tryAppend, tryPrepend]);

  // Flag the first user-initiated scroll so we never prepend on initial load.
  useEffect(() => {
    const teardown = onAnyScroll(() => {
      userScrolled.current = true;
    });
    return teardown;
  }, []);

  // ── URL sync (history.replaceState — no router push, no back-stack churn) ──
  const lastSyncedPath = useRef<string | null>(null);
  useEffect(() => {
    const path = `/reader/${currentKey.workSlug}/${currentKey.bookSlug}/${currentKey.chapter}`;
    if (lastSyncedPath.current === null) {
      // Seed without writing — the initial render already matches the URL.
      lastSyncedPath.current = `/reader/${work}/${book}/${chapterNum}`;
    }
    if (path === lastSyncedPath.current) return;
    lastSyncedPath.current = path;
    // replaceState keeps a single back-stack entry: one Back press returns the
    // user to wherever they came from, not through every chapter they scrolled.
    window.history.replaceState(window.history.state, "", path);
    void kvSet(
      "reader.last",
      JSON.stringify({
        work: currentKey.workSlug,
        book: currentKey.bookSlug,
        chapter: currentKey.chapter,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  // ── Navigation: reset / scroll / #v flash on real route changes ────────────
  useEffect(() => {
    if (!valid) return;
    setSelection(null);
    setHlUi(null);
    const pk: ChapterKey = { workSlug: work, bookSlug: book, chapter: chapterNum };
    const inStack = stackRef.current.chapters.some((k) => sameKey(k, pk));
    if (!inStack) {
      dispatch({ type: "reset", key: pk });
    }
    setCurrentKey(pk);
    lastSyncedPath.current = `/reader/${work}/${book}/${chapterNum}`;
    userScrolled.current = false;

    const wantVerse = location.hash.startsWith("#v")
      ? location.hash.slice(2)
      : null;
    const pkId = chapterKeyId(pk);
    let raf = 0;
    let attempts = 0;
    let flashTimer = 0;
    let flashed: Element | null = null;
    const tick = () => {
      const sectionEl = sectionEls.current.get(pkId);
      if (sectionEl) {
        if (wantVerse) {
          const vEl = sectionEl.querySelector<HTMLElement>(
            `[data-verse-anchor="${wantVerse}"]`,
          );
          if (vEl) {
            vEl.scrollIntoView({ behavior: "smooth", block: "center" });
            vEl.classList.remove("verse-flash");
            void vEl.offsetWidth; // restart the CSS animation on repeat clicks
            vEl.classList.add("verse-flash");
            flashed = vEl;
            flashTimer = window.setTimeout(
              () => vEl.classList.remove("verse-flash"),
              2500,
            );
            return;
          }
        } else if (attempts > 0) {
          // No hash: once the section exists, pin it to the top of the
          // viewport. Skip on the very first frame (attempts === 0) so a fresh
          // mount at scrollTop 0 isn't redundantly nudged.
          sectionEl.scrollIntoView({ block: "start" });
          return;
        }
      }
      if (attempts++ < 90) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(flashTimer);
      flashed?.classList.remove("verse-flash");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work, book, chapterNum, location.hash, location.key]);

  // ── Floating verse toolbar anchor ──────────────────────────────────────────
  useLayoutEffect(() => {
    if (selection === null) {
      setToolbarAnchor(null);
      return;
    }
    const sectionEl = sectionEls.current.get(chapterKeyId(selection.key));
    const scope: ParentNode = sectionEl ?? document;
    const compute = () => {
      const sideSel = selection.side
        ? `[data-verse-cell="${selection.number}"][data-verse-cell-side="${selection.side}"]`
        : null;
      const verseEl =
        (sideSel ? scope.querySelector<HTMLElement>(sideSel) : null) ??
        scope.querySelector<HTMLElement>(
          `[data-verse-cell="${selection.number}"]`,
        ) ??
        scope.querySelector<HTMLElement>(
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
    window.addEventListener("resize", compute);
    const teardownScroll = onAnyScroll(() => setSelection(null));
    return () => {
      window.removeEventListener("resize", compute);
      teardownScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, activeLangs.join(",")]);

  // ── Text-selection → highlight popover (document-level) ─────────────────────
  useEffect(() => {
    if (!valid) return;
    const onMouseUp = () => {
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return;
        const startBody = closestVerseBody(range.startContainer);
        const endBody = closestVerseBody(range.endContainer);
        // A partial highlight must live within a single verse body — which is
        // necessarily within a single ChapterSection. A drag that crosses verse
        // (and therefore chapter) boundaries fails this check and is ignored, so
        // cross-chapter selections never produce a malformed highlight (AC #8).
        if (!startBody || startBody !== endBody) return;
        const sectionEl = startBody.closest<HTMLElement>("[data-chapter-section]");
        if (!sectionEl) return;
        const ref = {
          workSlug: sectionEl.dataset.sectionWork ?? "",
          bookSlug: sectionEl.dataset.sectionBook ?? "",
          chapter: Number(sectionEl.dataset.sectionChapter),
          verse: Number(startBody.dataset.verseBody),
        };
        if (!ref.workSlug || !ref.bookSlug || !Number.isFinite(ref.chapter)) return;
        if (!Number.isFinite(ref.verse) || ref.verse < 1) return;
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
          ref,
          startToken: lo,
          endToken: hi,
          translation: side,
          rect,
        });
      });
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [valid]);

  // ── Entry-point validation (NotFound for bogus book / out-of-range chapter) ─
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

  const onOpenHighlight = useCallback((h: HighlightRow, rect: DOMRect) => {
    window.getSelection()?.removeAllRanges();
    setHlUi({
      kind: "edit",
      ref: {
        workSlug: h.work_slug,
        bookSlug: h.book_slug,
        chapter: h.chapter,
        verse: h.verse,
      },
      highlightId: h.id,
      color: h.color,
      translation: h.translation,
      startToken: h.start_token,
      endToken: h.end_token,
      rect,
    });
  }, []);

  if (!valid) return <Navigate to="/reader/bible/john/1" replace />;
  if (!bookQuery.isPending && bookQuery.data === null) return <NotFoundRoute />;
  if (
    !chapterCountQuery.isPending &&
    chapterCountQuery.data !== null &&
    chapterCountQuery.data !== undefined &&
    chapterNum > chapterCountQuery.data
  )
    return <NotFoundRoute />;

  const atCanonEnd =
    canon !== null &&
    stack.chapters.length > 0 &&
    nextChapterKey(stack.chapters[stack.chapters.length - 1], canon) === null;

  return (
    <article ref={articleRef} style={readerWrap}>
      <LanguageToggle />
      <div style={{ margin: "0 0 1.75rem" }}>
        <ChapterPicker
          workSlug={currentKey.workSlug}
          bookSlug={currentKey.bookSlug}
          bookName={bookDisplayName(currentKey.bookSlug)}
          current={currentKey.chapter}
          all={canon?.chapterCount[currentKey.bookSlug]
            ? Array.from(
                { length: canon.chapterCount[currentKey.bookSlug] },
                (_, i) => i + 1,
              )
            : []}
        />
      </div>

      <div ref={topSentinel} aria-hidden="true" />
      {stack.chapters.map((key, i) => (
        <ChapterSection
          key={chapterKeyId(key)}
          chapterKey={key}
          isFirst={i === 0}
          selection={selection}
          onSelectVerse={(k, n, side) =>
            setSelection(n === null ? null : { key: k, number: n, side })
          }
          onOpenStrongs={(id, rect) => setStrongs({ id, rect })}
          onOpenHighlight={onOpenHighlight}
          registerEl={registerEl}
        />
      ))}
      <div ref={bottomSentinel} aria-hidden="true" />

      {atCanonEnd ? (
        <p
          style={{
            textAlign: "center",
            color: "var(--color-fg-subtle)",
            fontStyle: "italic",
            fontSize: 13,
            padding: "2.5rem 0 0",
            marginTop: "2.5rem",
            borderTop: "1px solid var(--color-rule)",
          }}
        >
          End of canon.
        </p>
      ) : null}

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
              workSlug: selection.key.workSlug,
              bookSlug: selection.key.bookSlug,
              chapter: selection.key.chapter,
              verse: selection.number,
            }}
            side={selection.side}
            notes={selNotes.filter((n) => n.verse === selection.number)}
            onDone={() => setSelection(null)}
          />
        </div>
      ) : null}

      <ChapterNav
        workSlug={currentKey.workSlug}
        bookSlug={currentKey.bookSlug}
        current={currentKey.chapter}
        all={
          canon?.chapterCount[currentKey.bookSlug]
            ? Array.from(
                { length: canon.chapterCount[currentKey.bookSlug] },
                (_, i) => i + 1,
              )
            : []
        }
      />

      {work === "bible" && audioLangs.length > 0 && audioBarEnabled ? (
        <AudioBar available={audioLangs} current={currentKey} canon={canon} />
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
          state={hlUi}
          onClose={() => setHlUi(null)}
          onPick={(color) => {
            if (hlUi.kind === "new") {
              createHl.mutate({
                ref: hlUi.ref,
                color,
                translation: hlUi.translation,
                range: { startToken: hlUi.startToken, endToken: hlUi.endToken },
              });
            } else if (hlUi.startToken != null && hlUi.endToken != null) {
              deleteHl.mutate({ id: hlUi.highlightId, ref: hlUi.ref });
              createHl.mutate({
                ref: hlUi.ref,
                color,
                translation: hlUi.translation,
                range: { startToken: hlUi.startToken, endToken: hlUi.endToken },
              });
            }
          }}
          onRemove={
            hlUi.kind === "edit"
              ? () => deleteHl.mutate({ id: hlUi.highlightId, ref: hlUi.ref })
              : undefined
          }
        />
      ) : null}
    </article>
  );
}

/**
 * Thin wrapper that owns the "current chapter for audio follows scroll only
 * while paused" rule (spec AC #6). While the narration is playing we freeze the
 * operating chapter on whatever was playing, so scrolling to another chapter
 * doesn't yank the listener to a different audio file mid-sentence; once paused
 * or stopped, the operating chapter resumes following the scroll position.
 */
function AudioBar({
  available,
  current,
  canon,
}: {
  available: AudioTranslation[];
  current: ChapterKey;
  canon: Canon | null;
}) {
  const [playing, setPlaying] = useState(false);
  const [op, setOp] = useState<ChapterKey>(current);
  useEffect(() => {
    if (!playing) setOp(current);
  }, [playing, current]);
  // Auto-advance follows the operating chapter (the one actually playing, which
  // is frozen during playback), and only within the same book — audio files are
  // per-book, so there's no cross-book file to advance into.
  const nk = canon ? nextChapterKey(op, canon) : null;
  const next = nk && nk.bookSlug === op.bookSlug ? nk.chapter : null;
  return (
    <AudioPlayer
      available={available}
      workSlug={op.workSlug}
      bookSlug={op.bookSlug}
      chapter={op.chapter}
      nextChapter={next}
      onPlayingChange={setPlaying}
    />
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
 * Walk up from a node to the nearest [data-column] and fold its CorpusLanguage
 * into one of the four user-visible sides. Returns null for non-side columns
 * (en_brenton, la) or when no [data-column] ancestor exists.
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

// Bottom padding tracks the fixed AudioPlayer's measured height (it sets
// --audio-player-height on <html> while mounted) plus breathing room.
const readerWrap: React.CSSProperties = {
  maxWidth: "min(100%, 80em)",
  margin: "0 auto",
  padding: "2.5rem 2rem 0",
  paddingBottom: "calc(2.5rem + var(--audio-player-height, 0px))",
};
