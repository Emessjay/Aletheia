import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteSearch } from "@/db/hooks";
import { SEARCH_MARK_CLOSE, SEARCH_MARK_OPEN } from "@/db/queries";
import { getTranslation } from "@/domain/translations";

const PAGE_SIZE = 100;
const MAX_RESULTS = 1000;

export function SearchRoute() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [draft, setDraft] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useInfiniteSearch(q, PAGE_SIZE, MAX_RESULTS);
  const hits = search.data?.pages.flat() ?? [];

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
            {hits.length} loaded result{hits.length === 1 ? "" : "s"}
            {search.hasNextPage ? "+" : ""} for{" "}
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
      ) : hits.length === 0 ? (
        <p style={{ color: "var(--color-fg-muted)" }}>No matches.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {hits.map((hit) => (
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
                <span dir={getTranslation(hit.translation)?.direction ?? "ltr"}>
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
                  {getTranslation(hit.translation)?.shortLabel ?? hit.translation}
                  {" · "}
                  {hit.book_name} {hit.chapter}:{hit.verse}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {hits.length > 0 && search.hasNextPage ? (
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <button
            type="button"
            onClick={() => search.fetchNextPage()}
            disabled={search.isFetchingNextPage}
            style={loadMoreStyle}
          >
            {search.isFetchingNextPage ? "Loading…" : `Load ${PAGE_SIZE} more`}
          </button>
        </div>
      ) : hits.length >= MAX_RESULTS ? (
        <p
          style={{
            color: "var(--color-fg-subtle)",
            fontSize: 13,
            marginTop: 16,
            textAlign: "center",
          }}
        >
          Result cap reached ({MAX_RESULTS}). Refine your query to see more.
        </p>
      ) : null}
    </article>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: "var(--measure)",
  margin: "0 auto",
  padding: "2.5rem 2rem 6rem",
};

const loadMoreStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 14,
  fontFamily: "inherit",
  color: "var(--color-fg)",
  background: "var(--color-bg-elevated, var(--color-bg))",
  border: "1px solid var(--color-rule)",
  borderRadius: 6,
  cursor: "pointer",
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
