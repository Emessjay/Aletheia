import { Link } from "react-router-dom";
import { useWorks, useWorkSections } from "@/db/hooks";
import { isTauri } from "@/lib/tauri";
import type { WorkRow } from "@/db/types";

export function PatristicsIndexRoute() {
  const works = useWorks();

  if (!isTauri()) {
    return (
      <article style={wrap}>
        <p style={{ color: "var(--color-fg-muted)" }}>
          Run <code>npm run tauri dev</code> to read the patristic corpus.
        </p>
      </article>
    );
  }

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
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {(works.data ?? []).map((w) => (
            <WorkRowEntry key={w.id} work={w} />
          ))}
        </ul>
      )}
    </article>
  );
}

function WorkRowEntry({ work }: { work: WorkRow }) {
  const sections = useWorkSections(work.slug, "en");
  const first = sections.data?.[0];
  const href = first
    ? `/patristics/${work.slug}/${encodeURIComponent(first.ordinal_path)}`
    : `/patristics`;

  return (
    <li
      style={{
        padding: "1.2rem 0",
        borderBottom: "1px solid var(--color-rule)",
      }}
    >
      <Link
        to={href}
        style={{
          display: "block",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <h2
          style={{
            fontSize: 22,
            fontStyle: "italic",
            margin: 0,
            color: "var(--color-fg)",
          }}
        >
          {work.title}
        </h2>
        {work.author ? (
          <p
            style={{
              fontSize: 14,
              color: "var(--color-fg-muted)",
              margin: "4px 0 0",
            }}
          >
            {work.author}
          </p>
        ) : null}
        <p
          style={{
            fontSize: 12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-fg-subtle)",
            margin: "6px 0 0",
          }}
        >
          {sections.data?.length ?? "…"} sections
        </p>
      </Link>
    </li>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: "var(--measure)",
  margin: "0 auto",
  padding: "2.5rem 2rem 6rem",
};
