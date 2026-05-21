import { useRef, useState } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { translationShortLabel } from "@/domain/translations";
import {
  interlinearLabel,
  resolveInterlinear,
  type Tab,
} from "@/domain/tabs";

type DropMode = "before" | "after" | "merge";

/**
 * Tab bar for active translations. Click toggles a tab on/off; press-and-drag
 * reorders or merges. Dropping onto the center 40% of a single+single tab
 * merges them into one interlinear tab (if the pair is valid). Outer 30% on
 * either edge reorders before/after. Double-click on an interlinear splits it
 * back into two singles.
 *
 * Pointer events, not HTML5 drag-and-drop: in Tauri's WebKit on macOS the
 * dragenter/dragover/drop sequence frequently doesn't fire even with
 * `dragDropEnabled: false` on the window. Driving the drag ourselves with
 * pointer events behaves identically across all platforms.
 */
export function LanguageToggle() {
  const tabs = useSettingsStore((s) => s.tabs);
  const toggleTabAt = useSettingsStore((s) => s.toggleTabAt);
  const reorderTab = useSettingsStore((s) => s.reorderTab);
  const mergeTabs = useSettingsStore((s) => s.mergeTabs);
  const splitTab = useSettingsStore((s) => s.splitTab);

  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<
    { idx: number; mode: DropMode } | null
  >(null);
  // Eat the synthetic click after a drag-completing pointerup so the source
  // tab doesn't get toggled off by the drop.
  const suppressClickRef = useRef(false);
  // Drag ghost: a label that tracks the cursor while dragging. We position it
  // via direct style writes on each pointermove instead of React state to
  // avoid re-rendering the whole tab bar at pointer cadence.
  const ghostRef = useRef<HTMLDivElement>(null);

  function labelFor(t: Tab): string {
    return t.kind === "single"
      ? translationShortLabel(t.lang)
      : interlinearLabel(t.primary, t.secondary);
  }

  function startDrag(srcIdx: number, downEvent: React.PointerEvent) {
    if (downEvent.button !== 0) return; // left-click only
    const pointerId = downEvent.pointerId;
    const startX = downEvent.clientX;
    const startY = downEvent.clientY;
    let dragging = false;

    // Where is the cursor relative to a target tab, and what would dropping
    // there mean? Mirrors the original drop-region split: left 30% = before,
    // right 30% = after, center 40% = merge (only when the pair resolves to a
    // valid interlinear; otherwise falls back to reorder).
    const probeAt = (
      x: number,
      y: number,
    ): { idx: number; mode: DropMode } | null => {
      const el = document.elementFromPoint(x, y);
      const btn = el?.closest("[data-tab-idx]") as HTMLElement | null;
      const v = btn?.getAttribute("data-tab-idx");
      const idx = v ? Number(v) : NaN;
      if (!Number.isFinite(idx) || idx === srcIdx) return null;
      const rect = btn!.getBoundingClientRect();
      const offset = x - rect.left;
      const w = rect.width;
      if (offset < w * 0.3) return { idx, mode: "before" };
      if (offset > w * 0.7) return { idx, mode: "after" };
      const src = tabs[srcIdx];
      const tgt = tabs[idx];
      if (
        src?.kind === "single" &&
        tgt?.kind === "single" &&
        resolveInterlinear(src.lang, tgt.lang)
      ) {
        return { idx, mode: "merge" };
      }
      return { idx, mode: offset < w / 2 ? "before" : "after" };
    };

    const positionGhost = (x: number, y: number) => {
      const g = ghostRef.current;
      if (!g) return;
      g.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 5) {
        dragging = true;
        setDraggingIdx(srcIdx);
        const g = ghostRef.current;
        if (g) {
          g.textContent = labelFor(tabs[srcIdx]);
          g.style.visibility = "visible";
        }
      }
      if (!dragging) return;
      positionGhost(ev.clientX, ev.clientY);
      setDropTarget(probeAt(ev.clientX, ev.clientY));
    };

    const hideGhost = () => {
      const g = ghostRef.current;
      if (g) g.style.visibility = "hidden";
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      hideGhost();
      if (dragging) {
        const probe = probeAt(ev.clientX, ev.clientY);
        if (probe) {
          if (probe.mode === "merge") mergeTabs(srcIdx, probe.idx);
          else reorderTab(srcIdx, probe.idx, probe.mode);
        }
        suppressClickRef.current = true;
      }
      setDraggingIdx(null);
      setDropTarget(null);
    };

    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      hideGhost();
      setDraggingIdx(null);
      setDropTarget(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "baseline",
        flexWrap: "wrap",
        padding: "0 0 1rem",
        marginBottom: "1.5rem",
        borderBottom: "1px solid var(--color-rule)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-fg-muted)",
        }}
      >
        Translations
      </span>
      {tabs.map((tab, idx) => {
        const on = tab.active;
        const isDragging = draggingIdx === idx;
        const isDropTarget = dropTarget?.idx === idx && draggingIdx !== idx;
        const mode = isDropTarget ? dropTarget?.mode : null;
        const isMergeTarget = mode === "merge";
        return (
          <button
            key={tabKey(tab, idx)}
            type="button"
            data-tab-idx={idx}
            title={
              tab.kind === "interlinear" ? "Double-click to split" : undefined
            }
            onPointerDown={(e) => startDrag(idx, e)}
            onClick={(e) => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              // Ignore the first click of a double-click on an interlinear tab.
              if (e.detail >= 2) return;
              toggleTabAt(idx);
            }}
            onDoubleClick={() => {
              if (tab.kind === "interlinear") splitTab(idx);
            }}
            style={{
              background: isMergeTarget
                ? "var(--color-bg-inset)"
                : "transparent",
              border: 0,
              padding: "2px 0",
              font: "inherit",
              fontSize: 14,
              cursor: isDragging ? "grabbing" : "pointer",
              color: on ? "var(--color-fg)" : "var(--color-fg-subtle)",
              borderBottom: on
                ? "1px solid var(--color-accent)"
                : "1px solid transparent",
              outline: isMergeTarget
                ? "1px dashed var(--color-accent)"
                : "none",
              outlineOffset: isMergeTarget ? "2px" : undefined,
              boxShadow:
                mode === "before"
                  ? "-6px 0 0 -3px var(--color-accent)"
                  : mode === "after"
                    ? "6px 0 0 -3px var(--color-accent)"
                    : "none",
              opacity: isDragging ? 0.4 : 1,
              transition: "opacity 80ms, background 80ms",
              touchAction: "none",
              userSelect: "none",
            }}
          >
            {labelFor(tab)}
          </button>
        );
      })}
      {/* Drag ghost: tracks the cursor so it's obvious which tab is moving.
          pointer-events: none so it never blocks elementFromPoint sampling. */}
      <div
        ref={ghostRef}
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          visibility: "hidden",
          pointerEvents: "none",
          padding: "2px 8px",
          fontSize: 14,
          color: "var(--color-fg)",
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-rule-strong)",
          borderRadius: 2,
          boxShadow: "var(--shadow-pop)",
          zIndex: 1000,
          willChange: "transform",
        }}
      />
    </div>
  );
}

function tabKey(tab: Tab, idx: number): string {
  if (tab.kind === "single") return `s:${tab.lang}:${idx}`;
  return `i:${tab.primary}+${tab.secondary}:${idx}`;
}
