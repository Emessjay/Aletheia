import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearch } from "@/db/hooks";
import { SEARCH_MARK_CLOSE, SEARCH_MARK_OPEN, type SearchHit } from "@/db/queries";
import { parseReference, type ParsedReference } from "@/domain/reference";
import { useCommandPaletteStore } from "@/stores/useCommandPaletteStore";

type Row =
  | { kind: "reference"; ref: ParsedReference; hint: string; label: string }
  | { kind: "verse"; hit: SearchHit }
  | { kind: "empty"; message: string };

export function CommandPalette() {
  const open = useCommandPaletteStore((s) => s.open);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state every time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      // Defer focus until after the modal mounts.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const parsedRef = useMemo(() => parseReference(query), [query]);
  const search = useSearch(parsedRef ? "" : query, "en_bsb", 25);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (parsedRef) {
      out.push({
        kind: "reference",
        ref: parsedRef,
        hint: "Reference",
        label: refLabel(parsedRef),
      });
      return out;
    }
    if (!query.trim()) return out;
    if (search.isPending) {
      out.push({ kind: "empty", message: "Searching…" });
      return out;
    }
    if (search.isError) {
      // Surface a generic empty state rather than the raw Error.message — the
      // user typed a query, they don't need a stack-trace artifact in the
      // results list. The console still gets the full error from react-query.
      out.push({ kind: "empty", message: "No matches." });
      return out;
    }
    if (!search.data || search.data.length === 0) {
      out.push({ kind: "empty", message: "No matches." });
      return out;
    }
    for (const h of search.data) out.push({ kind: "verse", hit: h });
    return out;
  }, [parsedRef, query, search.data, search.isPending, search.isError, search.error]);

  // Clamp cursor when rows change.
  useEffect(() => {
    if (cursor >= rows.length) setCursor(Math.max(0, rows.length - 1));
  }, [rows.length, cursor]);

  const navigateRow = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === "reference") {
      navigate(row.ref.href);
      setOpen(false);
    } else if (row.kind === "verse") {
      navigate(
        `/reader/bible/${row.hit.book_slug}/${row.hit.chapter}#v${row.hit.verse}`,
      );
      setOpen(false);
    }
  };

  if (!open) return null;

  const actionableRows = rows.filter((r) => r.kind !== "empty");

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--color-scrim-soft)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
        zIndex: 300,
      }}
    >
      <div
        style={{
          width: "min(560px, 92vw)",
          background: "var(--color-bg)",
          border: "1px solid var(--color-rule-strong)",
          borderRadius: 3,
          boxShadow: "var(--shadow-pop)",
          overflow: "hidden",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Type a reference (John 3:16) or search scripture…"
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(actionableRows.length - 1, c + 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              navigateRow(actionableRows[cursor]);
              return;
            }
          }}
          style={{
            width: "100%",
            padding: "14px 16px",
            background: "transparent",
            border: 0,
            borderBottom:
              rows.length > 0 ? "1px solid var(--color-rule)" : "0",
            color: "var(--color-fg)",
            font: "inherit",
            fontSize: 16,
            fontStyle: "italic",
            outline: "none",
          }}
        />

        {rows.length > 0 ? (
          <ul
            role="listbox"
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              maxHeight: "60vh",
              overflowY: "auto",
            }}
          >
            {rows.map((row, i) => {
              if (row.kind === "empty") {
                return (
                  <li
                    key={`empty-${i}`}
                    style={{
                      padding: "10px 16px",
                      color: "var(--color-fg-subtle)",
                      fontStyle: "italic",
                    }}
                  >
                    {row.message}
                  </li>
                );
              }
              const isActive = actionableRows.indexOf(row) === cursor;
              return (
                <li
                  key={row.kind === "reference" ? "ref" : `v-${row.hit.verse_id}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    navigateRow(row);
                  }}
                  onMouseEnter={() =>
                    setCursor(actionableRows.indexOf(row))
                  }
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: "8px 16px",
                    cursor: "pointer",
                    background: isActive
                      ? "var(--color-bg-inset)"
                      : "transparent",
                  }}
                >
                  {row.kind === "reference" ? (
                    <>
                      <span>{row.label}</span>
                      <span
                        style={{ color: "var(--color-fg-subtle)", fontSize: 13 }}
                      >
                        {row.hint}
                      </span>
                    </>
                  ) : (
                    <VerseHitRow hit={row.hit} />
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function VerseHitRow({ hit }: { hit: SearchHit }) {
  return (
    <>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        <Snippet text={hit.snippet} />
      </span>
      <span
        style={{
          color: "var(--color-fg-subtle)",
          fontSize: 13,
          whiteSpace: "nowrap",
        }}
      >
        {hit.book_name} {hit.chapter}:{hit.verse}
      </span>
    </>
  );
}

function Snippet({ text }: { text: string }) {
  // The SQL snippet() delimiter is a non-HTML control marker; split safely.
  const parts: Array<{ marked: boolean; text: string }> = [];
  let rest = text;
  while (rest.length > 0) {
    const open = rest.indexOf(SEARCH_MARK_OPEN);
    if (open === -1) {
      parts.push({ marked: false, text: rest });
      break;
    }
    if (open > 0) parts.push({ marked: false, text: rest.slice(0, open) });
    rest = rest.slice(open + SEARCH_MARK_OPEN.length);
    const close = rest.indexOf(SEARCH_MARK_CLOSE);
    if (close === -1) {
      parts.push({ marked: true, text: rest });
      break;
    }
    parts.push({ marked: true, text: rest.slice(0, close) });
    rest = rest.slice(close + SEARCH_MARK_CLOSE.length);
  }
  return (
    <>
      {parts.map((p, i) =>
        p.marked ? (
          <span key={i} style={{ color: "var(--color-accent)" }}>
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function refLabel(ref: ParsedReference): string {
  const book = ref.bookSlug;
  const niceBook = book.charAt(0).toUpperCase() + book.slice(1);
  const ch = ref.chapter;
  return ref.verse !== null
    ? `${niceBook} ${ch}:${ref.verse}`
    : `${niceBook} ${ch}`;
}
