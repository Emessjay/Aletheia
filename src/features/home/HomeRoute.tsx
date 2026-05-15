import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { kvGet } from "@/db/user";
import { isTauri } from "@/lib/tauri";

interface LastPosition {
  work: string;
  book: string;
  chapter: number;
}

export function HomeRoute() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      try {
        const raw = await kvGet("reader.last");
        const parsed = raw ? (JSON.parse(raw) as LastPosition) : null;
        const target = parsed
          ? `/reader/${parsed.work}/${parsed.book}/${parsed.chapter}`
          : "/reader/bible/john/1";
        navigate(target, { replace: true });
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [navigate]);

  return (
    <article
      style={{
        maxWidth: "var(--measure)",
        margin: "0 auto",
        padding: "3rem 2rem",
      }}
    >
      <h1 style={{ fontSize: 28, fontStyle: "italic", marginBottom: "0.25em" }}>
        Aletheia
      </h1>
      <p style={{ color: "var(--color-fg-muted)", marginBottom: "1em" }}>
        Bible and classics reader.
      </p>
      {!isTauri() ? (
        <p style={{ color: "var(--color-fg-muted)" }}>
          Run <code>npm run tauri dev</code> to open the reader. Browser-only
          dev mode cannot reach the SQLite plugin.
        </p>
      ) : error ? (
        <pre style={{ color: "var(--color-accent)" }}>{error}</pre>
      ) : (
        <p style={{ color: "var(--color-fg-subtle)" }}>Resuming…</p>
      )}
    </article>
  );
}
