import { useEffect, useRef } from "react";
import { useStrongs } from "@/db/hooks";

interface Props {
  strongsId: string;
  anchorRect: DOMRect;
  onClose: () => void;
}

export function StrongsPopover({ strongsId, anchorRect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const q = useStrongs(strongsId);

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

  // Position below the anchor; clamp into viewport.
  const width = 320;
  const left = Math.min(
    Math.max(8, anchorRect.left + anchorRect.width / 2 - width / 2),
    window.innerWidth - width - 8,
  );
  const top = anchorRect.bottom + 6;

  const isHebrew = strongsId.startsWith("H");
  const lang = isHebrew ? "he" : "grc";

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Strong's entry ${strongsId}`}
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
          {strongsId}
        </span>
      </div>

      {q.data?.transliteration ? (
        <div style={{ fontStyle: "italic", color: "var(--color-fg-muted)" }}>
          {q.data.transliteration}
        </div>
      ) : null}

      {q.data?.gloss ? (
        <p style={{ marginTop: 10, fontSize: 15 }}>{q.data.gloss}</p>
      ) : null}

      {q.data?.definition ? (
        <p
          style={{
            marginTop: 10,
            fontSize: 14,
            color: "var(--color-fg-muted)",
            whiteSpace: "pre-wrap",
          }}
        >
          {q.data.definition}
        </p>
      ) : null}

      {q.isError ? (
        <p style={{ color: "var(--color-accent)", fontSize: 13 }}>
          Couldn’t load entry.
        </p>
      ) : null}
    </div>
  );
}
