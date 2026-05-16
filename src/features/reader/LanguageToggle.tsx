import { useRef, useState } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { TRANSLATION_LABELS } from "@/domain/translations";
import {
  interlinearLabel,
  resolveInterlinear,
  type Tab,
} from "@/domain/tabs";

type DropMode = "before" | "after" | "merge";

const DRAG_MIME = "application/x-aletheia-tab-index";

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
  // Mirror state in a ref for handlers that may run before the next render.
  const draggingRef = useRef<number | null>(null);
  // Suppress the click some browsers synthesize after a successful drop on the
  // source element — otherwise the post-drop click would toggle the tab.
  const suppressNextClickRef = useRef(false);

  function computeDropMode(
    e: React.DragEvent<HTMLButtonElement>,
    target: Tab,
    targetIdx: number,
  ): DropMode | null {
    const src = draggingRef.current;
    if (src === null || src === targetIdx) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    const leftEdge = w * 0.3;
    const rightEdge = w * 0.7;
    if (x < leftEdge) return "before";
    if (x > rightEdge) return "after";
    // Center 40%: a merge — only valid for single+single with a resolvable
    // primary/secondary. If invalid, fall back to a reorder so the gesture
    // still does *something* sensible.
    const srcTab = tabs[src];
    if (srcTab?.kind === "single" && target.kind === "single") {
      if (resolveInterlinear(srcTab.lang, target.lang)) return "merge";
    }
    return x < w / 2 ? "before" : "after";
  }

  function labelFor(t: Tab): string {
    return t.kind === "single"
      ? TRANSLATION_LABELS[t.lang]
      : interlinearLabel(t.primary, t.secondary);
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
            draggable
            title={
              tab.kind === "interlinear" ? "Double-click to split" : undefined
            }
            onClick={(e) => {
              if (suppressNextClickRef.current) {
                suppressNextClickRef.current = false;
                return;
              }
              // Don't toggle on the first half of a double-click.
              if (e.detail >= 2) return;
              toggleTabAt(idx);
            }}
            onDoubleClick={() => {
              if (tab.kind === "interlinear") splitTab(idx);
            }}
            onDragStart={(e) => {
              draggingRef.current = idx;
              setDraggingIdx(idx);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData(DRAG_MIME, String(idx));
              // Firefox needs text/plain set too.
              e.dataTransfer.setData("text/plain", labelFor(tab));
            }}
            onDragEnter={(e) => {
              if (draggingRef.current === null) return;
              e.preventDefault();
              const m = computeDropMode(e, tab, idx);
              if (m) setDropTarget({ idx, mode: m });
            }}
            onDragOver={(e) => {
              if (draggingRef.current === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const m = computeDropMode(e, tab, idx);
              if (m) {
                setDropTarget((cur) =>
                  cur && cur.idx === idx && cur.mode === m
                    ? cur
                    : { idx, mode: m },
                );
              }
            }}
            onDragLeave={() => {
              setDropTarget((cur) => (cur?.idx === idx ? null : cur));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const src = draggingRef.current;
              const target = dropTarget;
              if (src !== null && target && target.idx === idx) {
                if (target.mode === "merge") {
                  mergeTabs(src, idx);
                } else {
                  reorderTab(src, idx, target.mode);
                }
              }
              suppressNextClickRef.current = true;
              draggingRef.current = null;
              setDraggingIdx(null);
              setDropTarget(null);
            }}
            onDragEnd={() => {
              draggingRef.current = null;
              setDraggingIdx(null);
              setDropTarget(null);
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
            }}
          >
            {labelFor(tab)}
          </button>
        );
      })}
    </div>
  );
}

function tabKey(tab: Tab, idx: number): string {
  if (tab.kind === "single") return `s:${tab.lang}:${idx}`;
  return `i:${tab.primary}+${tab.secondary}:${idx}`;
}
