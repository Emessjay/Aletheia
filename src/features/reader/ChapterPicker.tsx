import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toRoman } from "./roman";

interface Props {
  workSlug: string;
  bookSlug: string;
  bookName: string | null;
  current: number;
  all: number[];
}

export function ChapterPicker({
  workSlug,
  bookSlug,
  bookName,
  current,
  all,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = bookName
    ? `${bookName} · Chapter ${toRoman(current)}`
    : `Chapter ${toRoman(current)}`;

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={all.length === 0}
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          margin: 0,
          font: "inherit",
          fontSize: 14,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-fg-muted)",
          cursor: all.length === 0 ? "default" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontVariantNumeric: "oldstyle-nums",
        }}
      >
        {label}
        {all.length > 0 ? (
          <span aria-hidden style={{ fontSize: 10, opacity: 0.7 }}>
            ▾
          </span>
        ) : null}
      </button>
      {open && all.length > 0 ? (
        <div
          role="listbox"
          aria-label="Select chapter"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 10,
            padding: 10,
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-rule)",
            borderRadius: "var(--radius-pop)",
            boxShadow: "var(--shadow-pop)",
            display: "grid",
            gridTemplateColumns: "repeat(10, 2.2em)",
            gap: 2,
            zIndex: 20,
          }}
        >
          {all.map((n) => {
            const isCurrent = n === current;
            return (
              <Link
                key={n}
                to={`/reader/${workSlug}/${bookSlug}/${n}`}
                onClick={() => setOpen(false)}
                role="option"
                aria-selected={isCurrent}
                style={{
                  display: "block",
                  padding: "4px 0",
                  textAlign: "center",
                  fontSize: 13,
                  textDecoration: "none",
                  color: isCurrent ? "var(--color-accent)" : "var(--color-fg)",
                  background: isCurrent
                    ? "var(--color-bg-inset)"
                    : "transparent",
                  borderRadius: "var(--radius-sm)",
                  fontFeatureSettings: '"onum"',
                }}
              >
                {n}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
