import { useRef, type ReactNode } from "react";

interface Props {
  surface: string;
  gloss: ReactNode;
  strongs: string | null;
  lang: "he" | "grc";
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
  lang,
  onOpenStrongs,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const clickable = !!strongs;
  return (
    <span
      className="al-il-word"
      onClick={
        clickable
          ? () => {
              if (ref.current && strongs) {
                onOpenStrongs(strongs, ref.current.getBoundingClientRect());
              }
            }
          : undefined
      }
      style={clickable ? { cursor: "pointer" } : undefined}
    >
      <span
        ref={ref}
        className={
          clickable ? "al-il-surface al-il-clickable" : "al-il-surface"
        }
        lang={lang}
      >
        {clean(surface)}
      </span>
      <span className="al-il-gloss">{gloss ?? " "}</span>
    </span>
  );
}

function clean(s: string): string {
  return s.replace(/\\/g, "").replace(/\//g, "");
}
