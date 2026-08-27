import type { SectionRow } from "@/db/types";
import type { WorkRow } from "@/db/types";

/** Collapse whitespace for label/body duplicate detection. */
export function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** True when a section has prose worth rendering beneath its heading. */
export function hasMeaningfulBody(s: Pick<SectionRow, "body" | "label">): boolean {
  if (!s.body) return false;
  const trimmed = s.body.trim();
  if (trimmed.length === 0) return false;
  if (!s.label) return true;
  const labelKey = normalizeForCompare(s.label);
  if (labelKey.length === 0) return true;
  if (normalizeForCompare(trimmed) === labelKey) return false;
  return true;
}

/** Clean a stored section label for display (sidebar, headings, breadcrumbs). */
export function normalizeSectionLabel(label: string | null | undefined): string {
  let raw = (label ?? "").trim();
  if (!raw) return "";
  raw = raw.replace(
    /\s+[—–-]\s+(Sect|Cap|Ch|Bk|Vol|St|S|Pt)\.?$/i,
    "",
  );
  raw = raw.replace(/\s*[—–-]\s*:\s*[—–-]\s*/g, " — ");
  raw = raw.replace(/^[—–:\s-]+/, "");
  raw = raw.replace(/\s+[—–-]\s*:\s*$/, "");
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Cap displayed text at the first sentence so sidebars and prev/next stay
 * scannable. Full label is exposed via `title`.
 */
export function shortenLabel(label: string): string {
  const normalized = normalizeSectionLabel(label);
  if (normalized.length <= 80) return normalized;
  const match = normalized.match(/^[^.!?]*[.!?]/);
  if (match && match[0].length > 0 && match[0].length < normalized.length) {
    return match[0];
  }
  return normalized.slice(0, 80).trimEnd() + "…";
}

/**
 * Split a patristic chapter label into rubric + optional caption.
 * Long synthesized captions (>70 chars or trailing ellipsis) are dropped
 * so the page heading does not repeat the opening paragraph.
 */
export function parseHeadingLabel(
  label: string | null | undefined,
): { lead: string; rest: string | null } | null {
  const raw = normalizeSectionLabel(label);
  if (!raw) return null;
  const m = raw.match(/^(.+?)\s*[—–]\s*(.+)$/);
  if (m && m[1].length <= 40) {
    const rest = m[2].trim();
    if (rest.length > 70 || rest.endsWith("…")) {
      return { lead: m[1].trim(), rest: null };
    }
    return { lead: m[1].trim(), rest };
  }
  return { lead: raw, rest: null };
}

/** Map CCEL series slugs ("anf01", "npnf204") to a readable series tag. */
export function seriesLabel(slug: string): string | null {
  const anf = slug.match(/^anf(\d{2})\./);
  if (anf) return `ANF ${toRoman(parseInt(anf[1], 10))}`;
  const npnf = slug.match(/^npnf([12])(\d{2})\./);
  if (npnf) {
    const ser = npnf[1] === "1" ? "NPNF¹" : "NPNF²";
    return `${ser} ${toRoman(parseInt(npnf[2], 10))}`;
  }
  return null;
}

/** Format work slug + metadata as a small-caps eyebrow line. */
export function eyebrowLine(work: WorkRow | null, fallbackSlug: string): string {
  if (work) {
    const series = seriesLabel(work.slug);
    return series ? `${series} · ${work.title}` : work.title;
  }
  const m = fallbackSlug.match(/^(anf\d{2}|npnf[12]\d{2})\.(.+)$/);
  if (m) {
    return `${m[1].toUpperCase()} · ${m[2].replace(/-/g, " ")}`;
  }
  return fallbackSlug;
}

function toRoman(n: number): string {
  const pairs: Array<[number, string]> = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  let rem = n;
  for (const [v, glyph] of pairs) {
    while (rem >= v) {
      out += glyph;
      rem -= v;
    }
  }
  return out;
}
