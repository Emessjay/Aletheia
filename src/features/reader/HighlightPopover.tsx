import { useEffect, useRef } from "react";
import type { HighlightColor } from "@/db/types";

const COLORS: HighlightColor[] = [
  "yellow",
  "green",
  "blue",
  "pink",
  "purple",
  "orange",
];

const COLOR_NAMES: Record<HighlightColor, string> = {
  yellow: "Saffron",
  green: "Sage",
  blue: "Lapis",
  pink: "Rose",
  purple: "Iris",
  orange: "Amber",
};

interface Props {
  anchorRect: DOMRect;
  activeColor?: HighlightColor | null;
  onPick: (color: HighlightColor) => void;
  onRemove?: () => void;
  onClose: () => void;
}

export function HighlightPopover({
  anchorRect,
  activeColor,
  onPick,
  onRemove,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Dismiss as soon as the user scrolls — the popover is anchored to a fixed
    // viewport rect, so any scroll desyncs it from the selection it belongs to.
    const onScroll = () => onClose();
    // mousedown fires before selection collapses; use mouseup so a fresh
    // selection-triggered popover isn't immediately dismissed by the same drag.
    document.addEventListener("mouseup", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener("mouseup", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  // Center horizontally over the selection; clamp into viewport. Place above
  // when there's room (selection sits in the user's reading flow, below is
  // often covered by the cursor); fall back to below otherwise.
  const width = 188;
  const height = 36;
  const gap = 6;
  const left = Math.min(
    Math.max(8, anchorRect.left + anchorRect.width / 2 - width / 2),
    window.innerWidth - width - 8,
  );
  const placeAbove = anchorRect.top >= height + gap + 8;
  const top = placeAbove
    ? anchorRect.top - height - gap
    : anchorRect.bottom + gap;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Highlight color"
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left,
        top,
        background: "var(--color-bg)",
        border: "1px solid var(--color-rule)",
        boxShadow: "var(--shadow-pop)",
        padding: "6px 8px",
        zIndex: 200,
        display: "flex",
        gap: 6,
        alignItems: "center",
      }}
    >
      {COLORS.map((c) => {
        const on = activeColor === c;
        return (
          <button
            key={c}
            type="button"
            aria-label={COLOR_NAMES[c]}
            title={COLOR_NAMES[c]}
            onClick={() => onPick(c)}
            style={{
              width: 18,
              height: 18,
              padding: 0,
              background: `var(--color-hl-${c})`,
              border: on
                ? "1.5px solid var(--color-accent)"
                : "1px solid var(--color-rule-strong)",
              borderRadius: 0,
              cursor: "pointer",
            }}
          />
        );
      })}
      {onRemove ? (
        <button
          type="button"
          aria-label="Remove highlight"
          title="Remove"
          onClick={onRemove}
          style={{
            background: "transparent",
            border: 0,
            padding: "0 4px",
            font: "inherit",
            fontSize: 16,
            lineHeight: 1,
            color: "var(--color-fg-muted)",
            cursor: "pointer",
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
