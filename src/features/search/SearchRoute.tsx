import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSearch } from "@/db/hooks";
import { SEARCH_MARK_CLOSE, SEARCH_MARK_OPEN } from "@/db/queries";

export function SearchRoute() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [draft, setDraft] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useSearch(q, "en_bsb", 100);

  // Keep the input synced if the URL changes externally (back/forward,
  // palette navigation). Only overwrite when the URL diverges from what
  // the user is currently typing.
  useEffect(() => {
    setDraft((prev) => (prev === q ? prev : q));
  }, [q]);

  // Auto-focus on mount so users who land here have somewhere to type.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = (next: string) => {
    const trimmed = next.trim();
    if (trimmed === q) return;
    if (trimmed.length === 0) {
      setParams({}, { replace: true });
    } else {
      setParams({ q: trimmed }, { replace: true });
    }
  };

  return (
    <article style={wrap}>
      <header style={{ marginBottom: "1.5rem" }}>
        <p className="al-eyebrow">Search</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commit(draft);
          }}
          role="search"
        >
          <input
            ref={inputRef}
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search the corpus…"
            aria-label="Search the corpus"
            spellCheck={false}
            autoComplete="off"
            style={inputStyle}
          />
        </form>
        {q && search.data ? (
          <p
            style={{
              color: "var(--color-fg-subtle)",
              fontSize: 13,
              marginTop: 8,
            }}
          >
            {search.data.length} result{search.data.length === 1 ? "" : "s"} for{" "}
            <span style={{ fontStyle: "italic" }}>“{q}”</span>
          </p>
        ) : null}
      </header>

      {!q ? (
        <p style={{ color: "var(--color-fg-muted)" }}>
          Type a word or phrase and press Enter. Tip: press <kbd>⌘K</kbd>{" "}
          anywhere to open the command palette.
        </p>
      ) : search.isPending ? (
        <p style={{ color: "var(--color-fg-muted)" }}>Searching…</p>
      ) : search.isError ? (
        <pre style={{ color: "var(--color-accent)" }}>{String(search.error)}</pre>
      ) : !search.data || search.data.length === 0 ? (
        <p style={{ color: "var(--color-fg-muted)" }}>No matches.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {search.data.map((hit) => (
            <li
              key={hit.verse_id}
              style={{
                padding: "12px 0",
                borderTop: "1px solid var(--color-rule)",
              }}
            >
              <Link
                to={`/reader/bible/${hit.book_slug}/${hit.chapter}#v${hit.verse}`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                }}
              >
                <span>
                  <Snippet text={hit.snippet} />
                </span>
                <span
                  style={{
                    color: "var(--color-fg-subtle)",
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    fontVariant: "small-caps",
                    letterSpacing: "0.06em",
                  }}
                >
                  {hit.book_name} {hit.chapter}:{hit.verse}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: "var(--measure)",
  margin: "0 auto",
  padding: "2.5rem 2rem 6rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 8,
  padding: "10px 12px",
  fontSize: 16,
  fontFamily: "inherit",
  color: "var(--color-fg)",
  background: "var(--color-bg-elevated, var(--color-bg))",
  border: "1px solid var(--color-rule)",
  borderRadius: 6,
  outline: "none",
  boxSizing: "border-box",
};

function Snippet({ text }: { text: string }) {
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
