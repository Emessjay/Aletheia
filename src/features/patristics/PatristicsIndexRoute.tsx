import { useMemo } from "react";
import { Link } from "react-router-dom";
import { usePatristicWorks } from "@/db/hooks";
import type { WorkRow } from "@/db/types";

export function PatristicsIndexRoute() {
  const works = usePatristicWorks();

  return (
    <article style={wrap}>
      <header style={{ marginBottom: "2rem" }}>
        <p className="al-eyebrow">Patristics</p>
        <h1
          style={{
            fontSize: 28,
            fontStyle: "italic",
            marginTop: 4,
          }}
        >
          Classical writings
        </h1>
      </header>

      {works.isPending ? (
        <p style={{ color: "var(--color-fg-muted)" }}>Loading…</p>
      ) : works.isError ? (
        <pre style={{ color: "var(--color-accent)" }}>{String(works.error)}</pre>
      ) : (
        <WorksByAuthor works={works.data ?? []} />
      )}
    </article>
  );
}

/** Group works by author and render each group as a section. Authors are
 *  sorted alphabetically by their sort-key (last word for single-name
 *  authors, full label for "Various" / multi-author). Within each author,
 *  works are sorted by title. */
function WorksByAuthor({ works }: { works: WorkRow[] }) {
  const groups = useMemo(() => groupByAuthor(works), [works]);
  return (
    <div>
      {groups.map((group) => (
        <section key={group.author} style={{ marginBottom: "2.5rem" }}>
          <h2 style={authorHeading}>{group.author}</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {group.works.map((w) => (
              <li key={w.id} style={workRow}>
                <Link to={`/patristics/${w.slug}`} style={workLink}>
                  {w.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

interface AuthorGroup {
  author: string;
  works: WorkRow[];
}

function groupByAuthor(works: WorkRow[]): AuthorGroup[] {
  const byAuthor = new Map<string, WorkRow[]>();
  for (const w of works) {
    const key = w.author?.trim() || "Various";
    const list = byAuthor.get(key) ?? [];
    list.push(w);
    byAuthor.set(key, list);
  }
  const groups: AuthorGroup[] = [];
  for (const [author, list] of byAuthor.entries()) {
    list.sort((a, b) => a.title.localeCompare(b.title));
    groups.push({ author, works: list });
  }
  // "Various" sinks to the bottom; everything else sorts alphabetically by
  // the author's sort-key (last token of the display name so "Augustine of
  // Hippo" sorts as "Hippo" — close enough to last-name ordering for a
  // field full of mononymous fathers).
  groups.sort((a, b) => {
    if (a.author === "Various") return 1;
    if (b.author === "Various") return -1;
    return authorSortKey(a.author).localeCompare(authorSortKey(b.author));
  });
  return groups;
}

function authorSortKey(author: string): string {
  // For "A & B" composites, sort by the first author's key. For "X of Y"
  // forms, use "X" (the personal name) since "of Y" is descriptor noise.
  const first = author.split(" & ")[0] ?? author;
  const beforeOf = first.split(/\s+of\s+/i)[0] ?? first;
  // Drop honorifics so "St. Augustine" sorts under A, not S.
  return beforeOf.replace(/^(?:St\.?|Saint)\s+/i, "").trim();
}

// ── styles ────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  maxWidth: "var(--measure)",
  margin: "0 auto",
  padding: "2.5rem 2rem 6rem",
};

const authorHeading: React.CSSProperties = {
  fontSize: 14,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--color-fg-muted)",
  margin: "0 0 0.6rem",
  paddingBottom: "0.35rem",
  borderBottom: "1px solid var(--color-rule)",
  fontWeight: 500,
};

const workRow: React.CSSProperties = {
  padding: "0.45rem 0",
};

// Italicise the work title so the browse list matches the commentaries hub
// — italic serif for the work title is the long-standing typographic
// convention for book titles, and aligning the two hubs keeps the
// browse-list feel consistent.
const workLink: React.CSSProperties = {
  color: "var(--color-fg)",
  fontSize: 16,
  fontStyle: "italic",
  textDecoration: "none",
};
