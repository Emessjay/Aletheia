import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { kvGet } from "@/db/user";

interface LastPosition {
  work: string;
  book: string;
  chapter: number;
}

export function HomeRoute() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  // Resolve last reading position from the user-data store and jump there.
  // On a fresh install kvGet returns null and we fall through to a sensible
  // default. Errors are surfaced inline rather than thrown so the landing
  // page never just blanks out.
  useEffect(() => {
    (async () => {
      try {
        const raw = await kvGet("reader.last");
        const parsed = raw ? (JSON.parse(raw) as LastPosition) : null;
        const target = parsed
          ? `/reader/${parsed.work}/${parsed.book}/${parsed.chapter}`
          : "/reader/bible/gen/1";
        navigate(target, { replace: true });
      } catch (e) {
        // A signed-out visitor has no saved position — that's the
        // fresh-install path, not an error. Anonymous browsing is allowed,
        // so land them at the default instead of an error on the front door.
        if (e instanceof Error && e.name === "AuthRequiredError") {
          navigate("/reader/bible/gen/1", { replace: true });
          return;
        }
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
      {error ? (
        <pre style={{ color: "var(--color-accent)" }}>{error}</pre>
      ) : (
        <p style={{ color: "var(--color-fg-subtle)" }}>Resuming…</p>
      )}
    </article>
  );
}
