import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";

/**
 * Global keyboard shortcuts:
 *   ⌘K / Ctrl+K        — toggle command palette (handled in AppShell)
 *   ?                   — toggle help overlay (returned via [helpOpen, setHelpOpen])
 *   g r / g l / g s — navigate (vim-style two-key chord, 1s timeout)
 *   [ / ]               — prev / next chapter on /reader/*
 *   Esc                 — close help overlay
 *
 * Listens at window level; ignores events while the target is an input/textarea
 * (so typing in the search field never navigates).
 */
export function useGlobalShortcuts(): {
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
} {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [helpOpen, setHelpOpen] = useState(false);

  // Refs so the listener captures fresh values without re-binding every render.
  const locRef = useRef(location);
  const paramsRef = useRef(params);
  locRef.current = location;
  paramsRef.current = params;

  useEffect(() => {
    let chord: { key: string; at: number } | null = null;
    const CHORD_MS = 900;

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      // ⌘K is handled by AppShell.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        setHelpOpen(false);
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      // Chapter nav.
      if (e.key === "[" || e.key === "]") {
        const onReader = locRef.current.pathname.startsWith("/reader");
        if (!onReader) return;
        e.preventDefault();
        const next = (window.document.querySelector(
          e.key === "[" ? 'a[href^="/reader/"][data-nav="prev"]' : 'a[href^="/reader/"][data-nav="next"]',
        ) as HTMLAnchorElement | null);
        if (next) next.click();
        return;
      }

      // g-prefixed two-key chord.
      const now = performance.now();
      if (chord && now - chord.at < CHORD_MS && chord.key === "g") {
        e.preventDefault();
        if (e.key === "r") navigate("/reader/bible/john/1");
        else if (e.key === "l") navigate("/libraries");
        else if (e.key === "s") navigate("/settings");
        else if (e.key === "h") navigate("/");
        chord = null;
        return;
      }
      if (e.key === "g") {
        chord = { key: "g", at: now };
        return;
      }
      chord = null;
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return { helpOpen, setHelpOpen };
}
