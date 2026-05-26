import { useEffect, useRef } from "react";
import type { HighlightColor, VerseRef } from "@/db/types";
import { useAuth } from "@/auth/AuthProvider";
import { useAuthScreen } from "@/auth/useAuthScreen";
import type { SideKey } from "@/domain/sides";

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

export interface NewHighlightState {
  kind: "new";
  ref: VerseRef;
  startToken: number;
  endToken: number;
  translation: SideKey;
  rect: DOMRect;
}

export interface EditHighlightState {
  kind: "edit";
  ref: VerseRef;
  highlightId: string;
  color: HighlightColor;
  /** Existing highlight's translation + range so a color-replace can
   *  reissue a create with the same scope. */
  translation: string | null;
  startToken: number | null;
  endToken: number | null;
  rect: DOMRect;
}

export type HighlightUiState = NewHighlightState | EditHighlightState;

interface Props {
  state: HighlightUiState;
  onClose: () => void;
  /** Called with the picked color when the user is authenticated. Optional
   *  because anonymous users see the CTA instead — and so the seeded test
   *  can render the popover without wiring mutations. */
  onPick?: (color: HighlightColor) => void;
  /** Called when the user removes an existing highlight (edit kind only). */
  onRemove?: () => void;
}

export function HighlightPopover(props: Props) {
  const { status } = useAuth();
  // Render two distinct components based on status so hook counts stay
  // consistent (the authenticated path uses no extra hooks beyond what the
  // anonymous one already has — but keeping them separate makes the auth
  // gate impossible to bypass and the seeded test doesn't need to wrap
  // the popover in any extra providers).
  if (status === "anonymous") {
    return <AnonymousPopover {...props} />;
  }
  return <AuthenticatedPopover {...props} />;
}

function useDismiss(
  ref: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Dismiss as soon as the user scrolls — the popover is anchored to a
    // fixed viewport rect, so any scroll desyncs it from the selection it
    // belongs to.
    const onScroll = () => onClose();
    // mousedown fires before selection collapses; use mouseup so a fresh
    // selection-triggered popover isn't immediately dismissed by the same
    // drag.
    document.addEventListener("mouseup", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener("mouseup", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [ref, onClose]);
}

function positionFor(anchorRect: DOMRect, width: number, height = 36, gap = 6) {
  const vw = typeof window !== "undefined" ? window.innerWidth : width;
  const left = Math.min(
    Math.max(8, anchorRect.left + anchorRect.width / 2 - width / 2),
    Math.max(8, vw - width - 8),
  );
  const placeAbove = anchorRect.top >= height + gap + 8;
  const top = placeAbove
    ? anchorRect.top - height - gap
    : anchorRect.bottom + gap;
  return { left, top };
}

function AnonymousPopover({ state, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const showAuth = useAuthScreen((s) => s.show);
  useDismiss(ref, onClose);
  const { left, top } = positionFor(state.rect, 240);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Sign in to save highlights"
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left,
        top,
        background: "var(--color-bg)",
        border: "1px solid var(--color-rule)",
        boxShadow: "var(--shadow-pop)",
        padding: "6px 10px",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <button
        type="button"
        onClick={() => {
          onClose();
          showAuth("signin");
        }}
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          font: "inherit",
          fontSize: 13,
          color: "var(--color-fg)",
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        Sign in to save highlights
      </button>
    </div>
  );
}

function AuthenticatedPopover({ state, onClose, onPick, onRemove }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  const activeColor = state.kind === "edit" ? state.color : null;
  const { left, top } = positionFor(state.rect, 188);

  const pick = (color: HighlightColor) => {
    onPick?.(color);
    if (state.kind === "new") window.getSelection()?.removeAllRanges();
    onClose();
  };
  const remove = () => {
    if (state.kind !== "edit") return;
    onRemove?.();
    onClose();
  };

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
            onClick={() => pick(c)}
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
      {state.kind === "edit" ? (
        <button
          type="button"
          aria-label="Remove highlight"
          title="Remove"
          onClick={remove}
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
