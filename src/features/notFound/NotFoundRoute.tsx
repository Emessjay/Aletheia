import { Link, useLocation } from "react-router-dom";

export function NotFoundRoute() {
  const loc = useLocation();
  return (
    <article
      style={{
        maxWidth: "var(--measure)",
        margin: "0 auto",
        padding: "3rem 2rem",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--color-fg-subtle)",
          marginBottom: "1.5em",
        }}
      >
        404
      </p>
      <h1
        style={{
          fontSize: 28,
          fontStyle: "italic",
          marginBottom: "0.5em",
          color: "var(--color-fg)",
        }}
      >
        Nothing here.
      </h1>
      <p
        style={{
          color: "var(--color-fg-muted)",
          marginBottom: "0.5em",
        }}
      >
        No page lives at this address.
      </p>
      <p
        style={{
          color: "var(--color-fg-subtle)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          wordBreak: "break-all",
          marginBottom: "2em",
        }}
      >
        {loc.pathname}
      </p>
      <Link
        to="/reader/bible/john/1"
        style={{
          display: "inline-block",
          padding: "0.55em 1.25em",
          border: "1px solid var(--color-rule-strong)",
          borderRadius: 2,
          textDecoration: "none",
          color: "var(--color-fg)",
          fontSize: 13,
          letterSpacing: "0.08em",
        }}
      >
        Open the reader
      </Link>
    </article>
  );
}
