import { Link } from "react-router-dom";

interface Props {
  workSlug: string;
  bookSlug: string;
  current: number;
  all: number[];
}

export function ChapterNav({ workSlug, bookSlug, current, all }: Props) {
  const idx = all.indexOf(current);
  const prev = idx > 0 ? all[idx - 1] : null;
  const next = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;

  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "2rem 0 0",
        borderTop: "1px solid var(--color-rule)",
        marginTop: "2.5rem",
      }}
    >
      <div style={{ flex: 1 }}>
        {prev ? (
          <Link to={`/reader/${workSlug}/${bookSlug}/${prev}`}>← Chapter {prev}</Link>
        ) : null}
      </div>
      <div
        style={{
          color: "var(--color-fg-subtle)",
          fontSize: 13,
          flex: 0,
          padding: "0 1em",
        }}
      >
        {idx + 1} / {all.length}
      </div>
      <div style={{ flex: 1, textAlign: "right" }}>
        {next ? (
          <Link to={`/reader/${workSlug}/${bookSlug}/${next}`}>Chapter {next} →</Link>
        ) : null}
      </div>
    </nav>
  );
}
