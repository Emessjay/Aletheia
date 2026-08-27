import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { kvGet } from "@/db/user";
import { getPlatform } from "@/platform";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  OPTIONAL_BUILD_PACKS,
  buildMacRecipe,
  type OptionalBuildPackId,
} from "./buildRecipe";

interface LastPosition {
  work: string;
  book: string;
  chapter: number;
}

const WEB_APP_PATH = "/reader/bible/gen/1";

export function HomeRoute() {
  const isDesktop = getPlatform().info.isDesktop;

  if (isDesktop) {
    return <DesktopResume />;
  }

  return <LandingPage />;
}

/** Desktop keeps the old resume-into-reader behavior. */
function DesktopResume() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await kvGet("reader.last");
        const parsed = raw ? (JSON.parse(raw) as LastPosition) : null;
        const target = parsed
          ? `/reader/${parsed.work}/${parsed.book}/${parsed.chapter}`
          : WEB_APP_PATH;
        navigate(target, { replace: true });
      } catch (e) {
        if (e instanceof Error && e.name === "AuthRequiredError") {
          navigate(WEB_APP_PATH, { replace: true });
          return;
        }
        setError(String(e));
      }
    })();
  }, [navigate]);

  return (
    <article className="al-page">
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

function LandingPage() {
  const [buildOpen, setBuildOpen] = useState(false);
  const [selected, setSelected] = useState<Set<OptionalBuildPackId>>(
    () => new Set(),
  );
  const [copied, setCopied] = useState(false);

  const recipe = buildMacRecipe(selected);

  const togglePack = (id: OptionalBuildPackId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setCopied(false);
  };

  const copyRecipe = async () => {
    try {
      await navigator.clipboard.writeText(recipe);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        background:
          "radial-gradient(ellipse 120% 80% at 50% -10%, var(--color-bg-elevated) 0%, var(--color-bg) 55%)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "14px 18px 0",
        }}
      >
        <ThemeToggle />
      </div>

      <article
        style={{
          flex: 1,
          maxWidth: "32em",
          margin: "0 auto",
          padding: "4rem 1.75rem 5rem",
          display: "flex",
          flexDirection: "column",
          justifyContent: buildOpen ? "flex-start" : "center",
        }}
      >
        <p className="al-eyebrow" style={{ marginBottom: "1.25rem" }}>
          Free · Open source · Never monetized
        </p>

        <h1
          style={{
            fontSize: "clamp(2.75rem, 8vw, 3.75rem)",
            fontStyle: "italic",
            fontWeight: 400,
            lineHeight: 1.05,
            margin: "0 0 0.85rem",
            color: "var(--color-fg)",
          }}
        >
          Aletheia
        </h1>

        <p
          style={{
            fontSize: "1.2rem",
            lineHeight: 1.45,
            color: "var(--color-fg-muted)",
            margin: "0 0 2.25rem",
            maxWidth: "28em",
          }}
        >
          Free, open-source Bible software — never monetized, no strings
          attached. Read Scripture, Strong&apos;s, and a public-domain corpus
          offline on your Mac, or in the browser.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: buildOpen ? "2.5rem" : 0,
          }}
        >
          <Link to={WEB_APP_PATH} style={primaryCtaStyle}>
            Open web version
          </Link>
          <button
            type="button"
            aria-expanded={buildOpen}
            onClick={() => setBuildOpen((v) => !v)}
            style={secondaryCtaStyle}
          >
            {buildOpen ? "Hide Mac build" : "Build for Mac"}
          </button>
        </div>

        {buildOpen ? (
          <section
            aria-label="Build for Mac"
            style={{
              borderTop: "1px solid var(--color-rule)",
              paddingTop: "1.75rem",
            }}
          >
            <h2
              style={{
                fontSize: 18,
                fontStyle: "italic",
                fontWeight: 400,
                margin: "0 0 0.5rem",
              }}
            >
              Build from source
            </h2>
            <p
              style={{
                margin: "0 0 1.25rem",
                color: "var(--color-fg-muted)",
                fontSize: 15,
                lineHeight: 1.5,
              }}
            >
              The base install always includes Bibles, Strong&apos;s lexicon,
              cross-references, Summa, and Creeds. Check any extras you want
              packed in, then copy the script — it installs missing tools
              (Xcode CLT, Homebrew, Node 20+, Rust) before building.
            </p>

            <fieldset
              style={{
                border: 0,
                margin: "0 0 1.5rem",
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <legend className="al-eyebrow" style={{ marginBottom: 8 }}>
                Additional components
              </legend>
              {OPTIONAL_BUILD_PACKS.map((pack) => {
                const id = pack.id as OptionalBuildPackId;
                const checked = selected.has(id);
                const audioNote =
                  pack.id === "audio-modern-en" ? " (~8 GB download)" : "";
                return (
                  <label
                    key={pack.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      cursor: "pointer",
                      fontSize: 15,
                      lineHeight: 1.4,
                      color: "var(--color-fg)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePack(id)}
                      style={{
                        marginTop: 4,
                        accentColor: "var(--color-accent)",
                        width: 16,
                        height: 16,
                        flexShrink: 0,
                      }}
                    />
                    <span>
                      <span style={{ fontWeight: 500 }}>{pack.title}</span>
                      {audioNote ? (
                        <span style={{ color: "var(--color-fg-subtle)" }}>
                          {audioNote}
                        </span>
                      ) : null}
                      <span
                        style={{
                          display: "block",
                          color: "var(--color-fg-muted)",
                          fontSize: 13,
                          marginTop: 2,
                        }}
                      >
                        {pack.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
                marginBottom: 8,
              }}
            >
              <p className="al-eyebrow" style={{ margin: 0 }}>
                Terminal
              </p>
              <button
                type="button"
                onClick={copyRecipe}
                className="al-tap"
                style={{
                  background: "transparent",
                  border: 0,
                  padding: "4px 0",
                  font: "inherit",
                  fontSize: 13,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--color-accent)",
                  cursor: "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <pre
              style={{
                margin: 0,
                padding: "1rem 1.1rem",
                background: "var(--color-bg-inset)",
                border: "1px solid var(--color-rule)",
                borderRadius: "var(--radius-pop)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                lineHeight: 1.55,
                overflowX: "auto",
                color: "var(--color-fg)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {recipe}
            </pre>
          </section>
        ) : null}
      </article>
    </div>
  );
}

const primaryCtaStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 20px",
  background: "var(--color-fg)",
  color: "var(--color-bg)",
  textDecoration: "none",
  fontSize: 13,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  border: "1px solid var(--color-fg)",
  borderRadius: "var(--radius-sm)",
};

const secondaryCtaStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 20px",
  background: "transparent",
  color: "var(--color-fg)",
  font: "inherit",
  fontSize: 13,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  border: "1px solid var(--color-rule-strong)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};
