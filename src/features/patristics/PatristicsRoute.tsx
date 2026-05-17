import { Link, Navigate, useParams } from "react-router-dom";
import { useChildSections, useSection, useSectionCitations, useWorkSections } from "@/db/hooks";
import type { SectionRow } from "@/db/types";
import { isTauri } from "@/lib/tauri";
import { SectionBody } from "./SectionBody";

const LANG_ATTR: Record<string, string> = { en: "en", la: "la", gr: "grc" };

// Kinds where it's worth showing the children inline (the section is a
// container heading and the real text lives in sub-sections).
const CONTAINER_KINDS = new Set(["part", "question", "article", "intro"]);

// Order for displaying article sub-sections in the Scholastic flow.
const SUB_KIND_ORDER: Record<string, number> = {
  objection: 1,
  sedcontra: 2,
  respondeo: 3,
  reply: 4,
};

export function PatristicsRoute() {
  const { work = "", section: sectionParam = "" } = useParams();
  const ordinalPath = decodeURIComponent(sectionParam);
  const valid = !!work && !!ordinalPath;

  if (!valid) return <Navigate to="/patristics" replace />;

  if (!isTauri()) {
    return (
      <article style={wrap}>
        <p style={{ color: "var(--color-fg-muted)" }}>
          Run <code>npm run tauri dev</code> to read.
        </p>
      </article>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <PatristicsSidebar workSlug={work} activePath={ordinalPath} />
      <main style={{ flex: 1, overflow: "auto" }}>
        <SectionView workSlug={work} ordinalPath={ordinalPath} />
      </main>
    </div>
  );
}

function SectionView({
  workSlug,
  ordinalPath,
}: {
  workSlug: string;
  ordinalPath: string;
}) {
  const section = useSection(workSlug, ordinalPath, "en");
  const children = useChildSections(workSlug, ordinalPath, "en");
  // Some sub-sections are only present in Latin (Summa respondeo etc.).
  const childrenLa = useChildSections(workSlug, ordinalPath, "la");
  const citations = useSectionCitations(section.data?.id ?? null);
  const allSections = useWorkSections(workSlug, "en");

  if (section.isPending) {
    return (
      <article style={wrap}>
        <p style={{ color: "var(--color-fg-muted)" }}>Loading…</p>
      </article>
    );
  }
  if (section.isError) {
    return (
      <article style={wrap}>
        <pre style={{ color: "var(--color-accent)" }}>{String(section.error)}</pre>
      </article>
    );
  }
  if (!section.data) {
    return (
      <article style={wrap}>
        <p style={{ color: "var(--color-fg-muted)" }}>
          Section not found: {ordinalPath}
        </p>
      </article>
    );
  }

  const s = section.data;
  const showChildren = CONTAINER_KINDS.has(s.kind);

  // Merge English + Latin children, keyed by ordinal_path. If en exists prefer
  // it; else fall back to la.
  const merged = mergeChildren(
    showChildren ? children.data ?? [] : [],
    showChildren ? childrenLa.data ?? [] : [],
  );

  // prev/next from the full english section list.
  const list = allSections.data ?? [];
  const idx = list.findIndex((r) => r.ordinal_path === ordinalPath);
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

  return (
    <article style={wrap}>
      <header style={{ marginBottom: "1.75rem" }}>
        <p className="al-eyebrow">
          {workSlug.charAt(0).toUpperCase() + workSlug.slice(1)} · {s.kind}
        </p>
        {s.label ? (
          <h1
            style={{
              fontSize: 24,
              fontStyle: "italic",
              marginTop: 4,
              color: "var(--color-fg)",
            }}
          >
            {s.label}
          </h1>
        ) : (
          <p
            style={{
              marginTop: 4,
              color: "var(--color-fg-subtle)",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
            }}
          >
            {s.ordinal_path}
          </p>
        )}
      </header>

      {hasMeaningfulBody(s) ? (
        <SectionBody
          body={s.body}
          citations={citations.data ?? []}
          lang={LANG_ATTR[s.language]}
        />
      ) : null}

      {merged.length > 0 ? (
        <div style={{ marginTop: "1.5rem" }}>
          {merged.map((c) => (
            <ChildSection key={`${c.ordinal_path}-${c.language}`} section={c} />
          ))}
        </div>
      ) : null}

      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "3rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid var(--color-rule)",
        }}
      >
        <div>
          {prev ? (
            <Link to={`/patristics/${workSlug}/${encodeURIComponent(prev.ordinal_path)}`}>
              ← {prev.label ?? prev.ordinal_path}
            </Link>
          ) : null}
        </div>
        <div>
          {next ? (
            <Link to={`/patristics/${workSlug}/${encodeURIComponent(next.ordinal_path)}`}>
              {next.label ?? next.ordinal_path} →
            </Link>
          ) : null}
        </div>
      </nav>
    </article>
  );
}

function ChildSection({ section }: { section: SectionRow }) {
  const citations = useSectionCitations(section.id);
  const kindLabel = formatKind(section);
  return (
    <section style={{ marginTop: "1.25rem" }}>
      <p
        style={{
          fontSize: 12,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-fg-muted)",
          margin: "0 0 4px",
        }}
      >
        {kindLabel}
      </p>
      <SectionBody
        body={section.body}
        citations={citations.data ?? []}
        lang={LANG_ATTR[section.language]}
      />
    </section>
  );
}

function PatristicsSidebar({
  workSlug,
  activePath,
}: {
  workSlug: string;
  activePath: string;
}) {
  const sections = useWorkSections(workSlug, "en");
  const items = (sections.data ?? []).filter(filterForToc);

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        overflowY: "auto",
        background: "var(--color-bg-elevated)",
        borderRight: "1px solid var(--color-rule)",
        padding: "16px 0",
      }}
    >
      {items.length === 0 ? (
        <p
          style={{
            padding: "0 18px",
            color: "var(--color-fg-muted)",
            fontSize: 13,
          }}
        >
          {sections.isPending ? "Loading…" : "No sections."}
        </p>
      ) : (
        items.map((s) => (
          <Link
            key={`${s.ordinal_path}-${s.id}`}
            to={`/patristics/${workSlug}/${encodeURIComponent(s.ordinal_path)}`}
            style={{
              display: "block",
              position: "relative",
              padding: `4px 18px 4px ${18 + depth(s.ordinal_path) * 10}px`,
              fontSize: 13,
              textDecoration: "none",
              color:
                s.ordinal_path === activePath
                  ? "var(--color-fg)"
                  : "var(--color-fg-muted)",
            }}
          >
            {s.ordinal_path === activePath ? (
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  background: "var(--color-accent)",
                }}
              />
            ) : null}
            {s.label ?? s.ordinal_path}
          </Link>
        ))
      )}
    </aside>
  );
}

function filterForToc(s: SectionRow): boolean {
  // Summa: list only headings; the rest is rendered inline.
  if (
    s.ordinal_path.startsWith("summa.") &&
    !["part", "question", "article", "intro"].includes(s.kind)
  ) {
    return false;
  }
  return true;
}

function depth(path: string): number {
  return Math.max(0, path.split(".").length - 2);
}

function hasMeaningfulBody(s: SectionRow): boolean {
  if (!s.body) return false;
  const trimmed = s.body.trim();
  if (trimmed.length === 0) return false;
  // Container sections often store only the label in body — don't re-render it.
  if (s.label && trimmed === s.label.trim()) return false;
  return true;
}

function mergeChildren(en: SectionRow[], la: SectionRow[]): SectionRow[] {
  const byPath = new Map<string, SectionRow>();
  for (const s of en) byPath.set(s.ordinal_path, s);
  for (const s of la) if (!byPath.has(s.ordinal_path)) byPath.set(s.ordinal_path, s);
  return [...byPath.values()].sort((a, b) => {
    // Scholastic sort: objection, sedcontra, respondeo, reply, then by ordering.
    const ak = SUB_KIND_ORDER[a.kind] ?? 99;
    const bk = SUB_KIND_ORDER[b.kind] ?? 99;
    if (ak !== bk) return ak - bk;
    return a.ordering - b.ordering;
  });
}

function formatKind(s: SectionRow): string {
  // Pull a number out of the path for prettier labelling: obj1 → "Objection 1".
  const tail = s.ordinal_path.split(".").pop() ?? "";
  const m = tail.match(/^(obj|rep)(\d+)$/);
  if (m) {
    return m[1] === "obj" ? `Objection ${m[2]}` : `Reply to objection ${m[2]}`;
  }
  if (tail === "sedcontra") return "On the contrary";
  if (tail === "respondeo") return "I answer that";
  if (s.label) return s.label;
  return s.kind;
}

const wrap: React.CSSProperties = {
  maxWidth: "var(--measure)",
  margin: "0 auto",
  padding: "2.5rem 2rem 6rem",
};
