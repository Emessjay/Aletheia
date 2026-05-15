import { Link, useSearchParams } from "react-router-dom";
import { useSearch } from "@/db/hooks";
import { SEARCH_MARK_CLOSE, SEARCH_MARK_OPEN } from "@/db/queries";
import { isTauri } from "@/lib/tauri";

export function SearchRoute() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const search = useSearch(q, "en_bsb", 100);

  if (!isTauri()) {
    return (
      <article style={wrap}>
        <p style={{ color: "var(--color-fg-muted)" }}>
          Run <code>npm run tauri dev</code> to search. Browser-only dev mode
          cannot reach the SQLite plugin.
        </p>
      </article>
    );
  }

  return (
    <article style={wrap}>
      <header style={{ marginBottom: "1.5rem" }}>
        <p className="al-eyebrow">Search</p>
        <h1
          style={{
            fontSize: 22,
            marginTop: 4,
            fontStyle: "italic",
            color: "var(--color-fg)",
          }}
        >
          {q ? <>“{q}”</> : "Enter a query"}
        </h1>
        {q && search.data ? (
          <p style={{ color: "var(--color-fg-subtle)", fontSize: 13 }}>
            {search.data.length} result{search.data.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </header>

      {!q ? (
        <p style={{ color: "var(--color-fg-muted)" }}>
          Tip: press <kbd>⌘K</kbd> anywhere to open the command palette.
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
