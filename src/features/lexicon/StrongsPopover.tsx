import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStrongs } from "@/db/hooks";

interface Props {
  strongsId: string;
  anchorRect: DOMRect;
  onClose: () => void;
}

const REF_RE = /\b([GH])(\d{1,5})\b/g;

function RefLink({
  id,
  onClick,
}: {
  id: string;
  onClick: (id: string) => void;
}) {
  const q = useStrongs(id);
  const lemma = q.data?.lemma;
  const lang = id.startsWith("H") ? "he" : "grc";
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      lang={lemma ? lang : undefined}
      style={{
        color: "var(--color-accent)",
        background: "none",
        border: "none",
        padding: 0,
        font: "inherit",
        cursor: "pointer",
      }}
    >
      {lemma ?? id}
    </button>
  );
}

function renderWithRefs(
  text: string,
  onNav: (id: string) => void,
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  REF_RE.lastIndex = 0;
  for (let match = REF_RE.exec(text); match; match = REF_RE.exec(text)) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const id = match[1] + match[2];
    parts.push(<RefLink key={key++} id={id} onClick={onNav} />);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function StrongsPopover({ strongsId, anchorRect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [currentId, setCurrentId] = useState(strongsId);
  const q = useStrongs(currentId);

  // If the parent picks a different anchor word, reset the navigation stack.
  useEffect(() => {
    setCurrentId(strongsId);
    setHistory([]);
  }, [strongsId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const navigateTo = (id: string) => {
    if (id === currentId) return;
    setHistory((h) => [...h, currentId]);
    setCurrentId(id);
  };

  const goBack = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setCurrentId(h[h.length - 1]);
      return h.slice(0, -1);
    });
  };

  // Position below the anchor; clamp into viewport.
  const width = 320;
  const left = Math.min(
    Math.max(8, anchorRect.left + anchorRect.width / 2 - width / 2),
    window.innerWidth - width - 8,
  );
  const top = anchorRect.bottom + 6;

  const isHebrew = currentId.startsWith("H");
  const lang = isHebrew ? "he" : "grc";

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Strong's entry ${currentId}`}
      style={{
        position: "fixed",
        left,
        top,
        width,
        maxHeight: "60vh",
        overflowY: "auto",
        background: "var(--color-bg)",
        border: "1px solid var(--color-rule)",
        borderRadius: 3,
        boxShadow: "var(--shadow-pop)",
        padding: "14px 16px",
        zIndex: 200,
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
        <span style={{ fontSize: 20 }} lang={lang}>
          {q.data?.lemma ?? (q.isPending ? "…" : "—")}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--color-fg-subtle)",
          }}
        >
          {currentId}
        </span>
      </div>

      {q.data?.transliteration ? (
        <div style={{ fontStyle: "italic", color: "var(--color-fg-muted)" }}>
          {q.data.transliteration}
        </div>
      ) : null}

      {q.data?.definition ? (
        <p
          style={{
            marginTop: 10,
            fontSize: 15,
            whiteSpace: "pre-wrap",
          }}
        >
          {renderWithRefs(q.data.definition, navigateTo)}
        </p>
      ) : null}

      {q.isError ? (
        <p style={{ color: "var(--color-accent)", fontSize: 13 }}>
          Couldn’t load entry.
        </p>
      ) : null}

      {history.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={goBack}
            aria-label="Back to previous entry"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: 14,
              color: "var(--color-fg-subtle)",
            }}
          >
            ←
          </button>
        </div>
      ) : null}
    </div>
  );
}
