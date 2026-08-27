import { useRef, type ReactNode } from "react";
import type { HighlightColor } from "@/db/types";
import { lexiconStrongsId } from "@/domain/strongsId";

interface Props {
  surface: string;
  gloss: ReactNode;
  strongs: string | null;
  lemma?: string | null;
  /** Script of the primary (top) surface token. */
  lang: "he" | "grc" | "en";
  /** Script of the under-word gloss when it differs from `lang` (English-primary). */
  glossLang?: "he" | "grc";
  highlightColor: HighlightColor | null;
  onOpenStrongs: (strongsId: string, rect: DOMRect) => void;
}

/**
 * One inline-block stack: primary surface on top, secondary gloss below in
 * smaller italic text. The clickable affordance points at the surface so the
 * underline cue lines up with the word itself, not the gloss.
 */
export function InterlinearWord({
  surface,
  gloss,
  strongs,
  lemma,
  lang,
  glossLang,
  highlightColor,
  onOpenStrongs,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const lexiconId = lexiconStrongsId(strongs, lemma);
  const clickable = !!lexiconId;
  const surfaceClass = [
    "al-il-surface",
    clickable ? "al-il-clickable" : null,
    highlightColor ? `al-hl al-hl-${highlightColor}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const surfaceLangAttr = lang === "en" ? "en" : lang;
  return (
    <span
      className="al-il-word"
      onClick={
        clickable
          ? (e) => {
              // Without stopPropagation the click bubbles to the verse
              // wrapper and opens the verse-annotation toolbar on top of
              // the lexicon — the round-2 critic's web-build regression.
              e.stopPropagation();
              if (ref.current && lexiconId) {
                onOpenStrongs(lexiconId, ref.current.getBoundingClientRect());
              }
            }
          : undefined
      }
      style={clickable ? { cursor: "pointer" } : undefined}
    >
      <span ref={ref} className={surfaceClass} lang={surfaceLangAttr}>
        {clean(surface)}
      </span>
      <span className="al-il-gloss" lang={glossLang}>
        {gloss ?? " "}
      </span>
    </span>
  );
}

function clean(s: string): string {
  return s.replace(/\\/g, "").replace(/\//g, "");
}
