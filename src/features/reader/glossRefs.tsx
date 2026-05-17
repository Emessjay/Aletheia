import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useStrongs } from "@/db/hooks";
import type { StrongsRow } from "@/db/types";

const REF_RE = /\b(?:([GH])(\d{1,5})|(\d{2,5}))\b/g;

/**
 * Render an interlinear gloss with embedded Strong's references resolved to
 * their lemma word. Bare numbers inherit the parent entry's prefix (Hebrew
 * glosses use "from 1234"; Greek glosses use "from G1234"). The lemma keeps
 * the surrounding gloss styling — no color shift — and reveals the referenced
 * entry's definition on hover.
 */
export function renderGloss(
  text: string,
  defaultPrefix: "G" | "H",
  strongsMap: Map<string, StrongsRow>,
): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  REF_RE.lastIndex = 0;
  for (let m = REF_RE.exec(text); m; m = REF_RE.exec(text)) {
    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index));
    }
    const prefix = (m[1] ?? defaultPrefix) as "G" | "H";
    const num = m[2] ?? m[3];
    const id = prefix + num;
    const row = strongsMap.get(id);
    parts.push(<GlossXref key={key++} id={id} row={row} />);
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

/**
 * Render a Strong's definition with embedded refs swapped for their lemma in
 * the accent color, mirroring StrongsPopover's clickable RefLink — but as
 * plain static spans (the hover tooltip has pointer-events: none). Each ref
 * fetches its own row lazily so we don't depend on the parent's pre-fetched
 * strongsMap, which only covers first-degree xrefs.
 */
function renderDefinitionWithRefs(
  text: string,
  defaultPrefix: "G" | "H",
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  REF_RE.lastIndex = 0;
  for (let m = REF_RE.exec(text); m; m = REF_RE.exec(text)) {
    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index));
    }
    const prefix = (m[1] ?? defaultPrefix) as "G" | "H";
    const num = m[2] ?? m[3];
    const id = prefix + num;
    parts.push(<XrefLemma key={key++} id={id} />);
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function XrefLemma({ id }: { id: string }) {
  const q = useStrongs(id);
  const lemma = q.data?.lemma;
  const lang: "he" | "grc" = id.startsWith("H") ? "he" : "grc";
  return (
    <span
      lang={lemma ? lang : undefined}
      style={{ color: "var(--color-accent)" }}
    >
      {lemma ?? id}
    </span>
  );
}

function GlossXref({
  id,
  row,
}: {
  id: string;
  row: StrongsRow | undefined;
}) {
  const lang: "he" | "grc" = id.startsWith("H") ? "he" : "grc";
  const ref = useRef<HTMLSpanElement>(null);
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(
    null,
  );

  const showTip = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setTipPos({ left: r.left, top: r.bottom + 4 });
  };
  const hideTip = () => setTipPos(null);

  const lemma = row?.lemma;
  const transliteration = row?.transliteration;
  const definition = row?.definition || row?.gloss;
  const defaultPrefix: "G" | "H" = lang === "he" ? "H" : "G";
  const width = 320;

  return (
    <>
      <span
        ref={ref}
        lang={lemma ? lang : undefined}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
      >
        {lemma ?? id}
      </span>
      {tipPos && (lemma || definition)
        ? createPortal(
            <div
              role="tooltip"
              style={{
                position: "fixed",
                left: Math.min(tipPos.left, window.innerWidth - width - 8),
                top: tipPos.top,
                width,
                background: "var(--color-bg)",
                border: "1px solid var(--color-rule)",
                borderRadius: 3,
                boxShadow: "var(--shadow-pop)",
                padding: "14px 16px",
                zIndex: 300,
                pointerEvents: "none",
                fontStyle: "normal",
                color: "var(--color-fg)",
                direction: "ltr",
                whiteSpace: "normal",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 4,
                  gap: 8,
                }}
              >
                <span
                  lang={lemma ? lang : undefined}
                  style={{
                    fontSize: 20,
                    direction: lang === "he" ? "rtl" : "ltr",
                    unicodeBidi: "isolate",
                  }}
                >
                  {lemma ?? "—"}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--color-fg-subtle)",
                  }}
                >
                  {id}
                </span>
              </div>
              {transliteration ? (
                <div
                  style={{
                    fontStyle: "italic",
                    color: "var(--color-fg-muted)",
                  }}
                >
                  {transliteration}
                </div>
              ) : null}
              {definition ? (
                <p
                  style={{
                    marginTop: 10,
                    marginBottom: 0,
                    fontSize: 15,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {renderDefinitionWithRefs(definition, defaultPrefix)}
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
