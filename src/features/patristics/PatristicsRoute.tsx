import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  useChildSections,
  usePatristicWorks,
  useSection,
  useSectionCitations,
  useWorkSectionOutline,
} from "@/db/hooks";
import type { SectionOutlineRow, SectionRow, WorkRow } from "@/db/types";
import { useViewportWidth } from "@/lib/useViewportWidth";
import { SectionBody } from "./SectionBody";

// Match AppShell's SIDEBAR_BREAKPOINT so the patristics sidebar collapses at
// the same width as the top-nav links. Below this, the 280px sidebar would
// crush the reading panel to ~95px on a 375px-wide phone.
const SIDEBAR_BREAKPOINT = 760;

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

// Scholastic kinds keep their typographic eyebrow rubric ("Objection 1",
// "I answer that"); patristic kinds (sermon / homily / discourse / section
// titles) render as real <h2> sub-headings so the hierarchy is visible at a
// glance instead of melting into the surrounding prose.
const SCHOLASTIC_KINDS = new Set([
  "objection",
  "reply",
  "sedcontra",
  "respondeo",
]);

export function PatristicsRoute() {
  const { work = "", section: sectionParam = "" } = useParams();
  const ordinalPath = decodeURIComponent(sectionParam);
  const valid = !!work && !!ordinalPath;

  if (!valid) return <Navigate to="/patristics" replace />;

  return <PatristicsLayout workSlug={work} ordinalPath={ordinalPath} />;
}

function PatristicsLayout({
  workSlug,
  ordinalPath,
}: {
  workSlug: string;
  ordinalPath: string;
}) {
  const viewportW = useViewportWidth();
  const compact = viewportW < SIDEBAR_BREAKPOINT;
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Auto-close drawer when switching section or transitioning to desktop.
  useEffect(() => setDrawerOpen(false), [ordinalPath, compact]);

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        minHeight: 0,
        position: "relative",
      }}
    >
      {!compact ? (
        <PatristicsSidebar workSlug={workSlug} activePath={ordinalPath} />
      ) : null}
      <main style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
        {compact ? (
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid var(--color-rule)",
              background: "var(--color-bg-elevated)",
              position: "sticky",
              top: 0,
              zIndex: 5,
            }}
          >
            <button
              type="button"
              aria-label="Show section list"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
              style={{
                background: "transparent",
                border: "1px solid var(--color-rule)",
                borderRadius: 3,
                padding: "5px 10px",
                font: "inherit",
                fontSize: 12,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--color-fg-muted)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ListIcon />
              Sections
            </button>
          </div>
        ) : null}
        <SectionView workSlug={workSlug} ordinalPath={ordinalPath} />
      </main>
      {compact && drawerOpen ? (
        <>
          <div
            role="presentation"
            onClick={() => setDrawerOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              background: "var(--color-scrim)",
              zIndex: 50,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "min(300px, 85vw)",
              zIndex: 60,
              boxShadow: "var(--shadow-pop)",
              background: "var(--color-bg-elevated)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                padding: "6px 8px",
                borderBottom: "1px solid var(--color-rule)",
              }}
            >
              <button
                type="button"
                aria-label="Close section list"
                onClick={() => setDrawerOpen(false)}
                style={{
                  background: "transparent",
                  border: 0,
                  padding: 4,
                  color: "var(--color-fg-muted)",
                  cursor: "pointer",
                  lineHeight: 0,
                }}
              >
                <CloseIcon />
              </button>
            </div>
            <PatristicsSidebar
              workSlug={workSlug}
              activePath={ordinalPath}
              onNavigate={() => setDrawerOpen(false)}
              fillHeight
            />
          </div>
        </>
      ) : null}
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
  const allSections = useWorkSectionOutline(workSlug, "en");
  const allWorks = usePatristicWorks();
  const work = (allWorks.data ?? []).find((w) => w.slug === workSlug) ?? null;

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

  const heading = parseHeadingLabel(s.label);

  const trail = breadcrumbTrail(list, ordinalPath, work);

  return (
    <>
      <StickyBreadcrumb trail={trail} />
      <article style={wrap}>
      <header style={{ marginBottom: "1.75rem" }}>
        <p className="al-eyebrow">{eyebrowLine(work, workSlug)}</p>
        {heading ? (
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              marginTop: 4,
              color: "var(--color-fg)",
              lineHeight: 1.25,
            }}
          >
            {heading.lead}
            {heading.rest ? (
              <span
                style={{
                  display: "block",
                  fontSize: 18,
                  fontWeight: 400,
                  fontStyle: "italic",
                  color: "var(--color-fg-muted)",
                  marginTop: 6,
                  lineHeight: 1.35,
                }}
              >
                {heading.rest}
              </span>
            ) : null}
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
            <Link
              to={`/patristics/${workSlug}/${encodeURIComponent(prev.ordinal_path)}`}
              title={prev.label ?? undefined}
            >
              ← {shortenLabel(prev.label ?? prev.ordinal_path)}
            </Link>
          ) : null}
        </div>
        <div>
          {next ? (
            <Link
              to={`/patristics/${workSlug}/${encodeURIComponent(next.ordinal_path)}`}
              title={next.label ?? undefined}
            >
              {shortenLabel(next.label ?? next.ordinal_path)} →
            </Link>
          ) : null}
        </div>
      </nav>
    </article>
    </>
  );
}

function StickyBreadcrumb({ trail }: { trail: string[] }) {
  if (trail.length === 0) return null;
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "var(--color-bg-elevated)",
        borderBottom: "1px solid var(--color-rule)",
        padding: "8px 2rem",
        fontSize: 12,
        color: "var(--color-fg-muted)",
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      aria-label="Current section"
    >
      {trail.join(" · ")}
    </div>
  );
}

/** Build "Author · Title · Book I · Chapter VIII"-style trail from the work
 *  metadata plus the ancestor chain of the active section. Ancestors are
 *  computed by ordinal-path prefix; each parent label is run through
 *  parseHeadingLabel so we show just the rubric, not the full caption. */
function breadcrumbTrail(
  allSections: SectionOutlineRow[],
  activePath: string,
  work: WorkRow | null,
): string[] {
  const parts: string[] = [];
  if (work) {
    if (work.author) parts.push(work.author);
    parts.push(work.title);
  }
  if (allSections.length === 0 || !activePath) return parts;
  const byPath = new Map<string, SectionOutlineRow>();
  for (const s of allSections) byPath.set(s.ordinal_path, s);

  // Walk from root to active section using dotted prefixes.
  const segments = activePath.split(".");
  for (let i = 1; i <= segments.length; i++) {
    const prefix = segments.slice(0, i).join(".");
    const row = byPath.get(prefix);
    if (!row) continue;
    const heading = parseHeadingLabel(row.label);
    const lead = heading?.lead ?? row.ordinal_path;
    parts.push(lead);
  }
  return parts;
}

function ChildSection({ section }: { section: SectionRow }) {
  const citations = useSectionCitations(section.id);
  const kindLabel = formatKind(section);
  const scholastic = SCHOLASTIC_KINDS.has(section.kind);
  return (
    <section style={{ marginTop: scholastic ? "1.25rem" : "1.75rem" }}>
      {scholastic ? (
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
      ) : (
        <h2
          style={{
            fontSize: 19,
            fontWeight: 600,
            lineHeight: 1.3,
            margin: "0 0 0.5em",
            color: "var(--color-fg)",
          }}
        >
          {kindLabel}
        </h2>
      )}
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
  onNavigate,
  fillHeight = false,
}: {
  workSlug: string;
  activePath: string;
  onNavigate?: () => void;
  fillHeight?: boolean;
}) {
  const sections = useWorkSectionOutline(workSlug, "en");
  const items = (sections.data ?? []).filter(filterForToc);
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  // Once the active item is in the DOM (and on every activePath change),
  // pull it into the visible region of the sidebar. `block: "nearest"`
  // means we only scroll when the item isn't already visible — clicks on
  // items that are already on-screen don't yank the sidebar around.
  useEffect(() => {
    const el = activeRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activePath, items.length]);

  return (
    <aside
      style={{
        width: fillHeight ? "100%" : 280,
        flex: fillHeight ? "1 1 auto" : undefined,
        flexShrink: 0,
        overflowY: "auto",
        background: "var(--color-bg-elevated)",
        borderRight: fillHeight ? undefined : "1px solid var(--color-rule)",
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
            ref={s.ordinal_path === activePath ? activeRef : undefined}
            to={`/patristics/${workSlug}/${encodeURIComponent(s.ordinal_path)}`}
            onClick={onNavigate}
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
            <span title={s.label ?? undefined}>
              {shortenLabel(s.label ?? s.ordinal_path)}
            </span>
          </Link>
        ))
      )}
    </aside>
  );
}

function filterForToc(s: SectionOutlineRow): boolean {
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

// Some patristic chapter/subchapter labels are full sentences or paragraphs.
// Cap displayed text at the first sentence so the sidebar and prev/next nav
// stay scannable; the unabridged label is exposed via the `title` attribute.
function shortenLabel(label: string): string {
  if (label.length <= 80) return label;
  const match = label.match(/^[^.!?]*[.!?]/);
  if (match && match[0].length > 0 && match[0].length < label.length) {
    return match[0];
  }
  return label.slice(0, 80).trimEnd() + "…";
}

function hasMeaningfulBody(s: SectionRow): boolean {
  if (!s.body) return false;
  const trimmed = s.body.trim();
  if (trimmed.length === 0) return false;
  if (!s.label) return true;
  const labelKey = normalizeForCompare(s.label);
  if (labelKey.length === 0) return true;
  // Container sections often store only the label (or an all-caps / line-wrapped
  // variant of it) in the body — don't re-render the same words as a paragraph.
  if (normalizeForCompare(trimmed) === labelKey) return false;
  return true;
}

function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Format the workSlug + work title as a small-caps eyebrow. CCEL series slugs
 *  like "anf01.justin-martyr" are cosmetically ugly; prefer the work's title
 *  with the series prefix promoted to a short label ("ANF I · Writings of …"). */
function eyebrowLine(work: WorkRow | null, fallbackSlug: string): string {
  if (work) {
    const series = seriesLabel(work.slug);
    return series ? `${series} · ${work.title}` : work.title;
  }
  // Fallback while the works list is loading — strip series prefix at least.
  const m = fallbackSlug.match(/^(anf\d{2}|npnf[12]\d{2})\.(.+)$/);
  if (m) {
    return `${m[1].toUpperCase()} · ${m[2].replace(/-/g, " ")}`;
  }
  return fallbackSlug;
}

/** Map CCEL series slugs ("anf01", "npnf204") to a readable series tag. */
function seriesLabel(slug: string): string | null {
  const anf = slug.match(/^anf(\d{2})\./);
  if (anf) return `ANF ${toRoman(parseInt(anf[1], 10))}`;
  const npnf = slug.match(/^npnf([12])(\d{2})\./);
  if (npnf) {
    const ser = npnf[1] === "1" ? "NPNF¹" : "NPNF²";
    return `${ser} ${toRoman(parseInt(npnf[2], 10))}`;
  }
  return null;
}

function toRoman(n: number): string {
  const pairs: Array<[number, string]> = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let rem = n;
  for (const [v, glyph] of pairs) {
    while (rem >= v) { out += glyph; rem -= v; }
  }
  return out;
}

/** Patristic chapter labels often combine an ordinal rubric with a descriptive
 *  caption: "Chapter VI.—Charge of atheism refuted." Render the rubric in
 *  weighted text and the caption in italic underneath, the way a printed page
 *  splits a chapter number from its subtitle. Returns `null` if the label is
 *  too short to bother splitting (or empty).
 *
 *  When the caption is a long body-excerpt rather than a tight description
 *  (as happens in Luther's *Bondage of the Will*, where the parser had to
 *  synthesize a label from the first sentence), drop the caption — showing it
 *  italicised right above an opening paragraph that begins with the same
 *  words just looks like a stutter. The shorter, summary-style captions used
 *  by ANF/NPNF stay. */
function parseHeadingLabel(
  label: string | null | undefined,
): { lead: string; rest: string | null } | null {
  const raw = (label ?? "").trim();
  if (!raw) return null;
  // Drop the trailing-fragment garbage that the ThML label-synthesizer
  // sometimes leaves behind ("Section XLI. — Sect"). The opening rubric is
  // structurally sound; the truncated suffix is not.
  const cleaned = raw.replace(
    /\s+[—–-]\s+(Sect|Cap|Ch|Bk|Vol|St|S|Pt)\.?$/i,
    "",
  );
  // Split on the first em-/en-dash that separates rubric from caption.
  const m = cleaned.match(/^(.+?)\s*[—–]\s+(.+)$/);
  if (m && m[1].length <= 40) {
    const rest = m[2].trim();
    // Caption longer than ~70 chars (or trailing in an ellipsis) is almost
    // always a synthesized snippet rather than a tight description — the
    // page heading shouldn't show it twice.
    if (rest.length > 70 || rest.endsWith("…")) {
      return { lead: m[1].trim(), rest: null };
    }
    return { lead: m[1].trim(), rest };
  }
  return { lead: cleaned, rest: null };
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

function ListIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    >
      <path d="M2 3h10M2 7h10M2 11h10" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
