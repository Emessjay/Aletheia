import { Link } from "react-router-dom";
import type { CitationRow } from "@/db/types";
import { findScriptureReferences } from "@/domain/scriptureRefs";

interface Props {
  body: string;
  citations: CitationRow[];
  lang?: string;
}

/**
 * Render a section body as a stack of `<p>` paragraphs. Ingest writes
 * paragraph breaks as `\n\n` and lets source line-wrapping leak through as
 * single `\n`s, which we collapse to spaces here — otherwise `pre-wrap`
 * would preserve them as visible hard breaks mid-sentence.
 *
 * ThMLParser embeds `{ref:PASSAGE}` inline tokens for every <scripRef>, but
 * the visible passage text immediately follows the token, so keeping both
 * reads like double-print. Strip the tokens before paragraph splitting.
 *
 * The unlinked branch is the only one exercised today — none of the works
 * that carry {ref:…} tokens have rows in the `citation` table, and the
 * Summa parser likewise emits no citations. The Link branch below stays
 * here for a future citation pass; it operates on the pre-paragraph-split
 * string, so spans must be computed against that representation.
 */
const REF_TOKEN_RE = /\{ref:[^}]*\}/g;
const PARAGRAPH_BREAK_RE = /\n{2,}/g;
const INTERNAL_WS_RE = /\s+/g;
// Migne / Maurist section markers embedded mid-paragraph: "…doctrine. 2. Still,
// as you nevertheless…". CCEL inherits these from the printed editions but
// rarely surrounds them with paragraph breaks, so the whole numbered run
// collapses into one wall of text. Split before the marker when it follows
// sentence-end punctuation and precedes a capital letter; the number stays as
// the lead of the new paragraph.
const MIGNE_MARKER_SPLIT_RE =
  /(?<=[.!?…”’")\]])\s+(?=\d{1,3}\.\s+[A-Z“"‘'])/g;
// Luther / Calvin block quotes are sometimes delimited by lone em-dash lines
// in the source: a paragraph starts with "— …quoted text…" and ends with
// "…quoted text… —". Lift those into a real <blockquote> and drop the dashes
// so they don't read like the writer talking to himself.
const BLOCKQUOTE_DELIM_RE = /^[—–]\s+([\s\S]*?)\s*[—–]$/;

const paraStyle: React.CSSProperties = {
  margin: "0 0 0.9em",
  lineHeight: 1.55,
};
const blockquoteStyle: React.CSSProperties = {
  margin: "0.4em 0 1.1em",
  padding: "0 0 0 1em",
  borderLeft: "2px solid var(--color-rule)",
  color: "var(--color-fg)",
  fontStyle: "italic",
  lineHeight: 1.55,
};

/** Scan a paragraph for scripture references and splice them as Links into
 *  the prose. Reference styling falls through to the global `a` rule (accent
 *  color, thin underline) so light/dark theme parity is automatic. */
function linkifyScriptureRefs(text: string): React.ReactNode {
  const hits = findScriptureReferences(text);
  if (hits.length === 0) return text;
  const out: React.ReactNode[] = [];
  let cursor = 0;
  hits.forEach((hit, i) => {
    if (hit.start > cursor) out.push(text.slice(cursor, hit.start));
    out.push(
      <Link
        key={`ref-${i}-${hit.start}`}
        to={hit.parsed.href}
        title={`${hit.parsed.bookSlug} ${hit.parsed.chapter}${hit.parsed.verse !== null ? ":" + hit.parsed.verse : ""}`}
      >
        {hit.text}
      </Link>,
    );
    cursor = hit.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(PARAGRAPH_BREAK_RE)
    .flatMap((p) => p.split(MIGNE_MARKER_SPLIT_RE))
    .map((p) => p.replace(INTERNAL_WS_RE, " ").trim())
    .filter((p) => p.length > 0);
}

export function SectionBody({ body, citations, lang }: Props) {
  const stripped = body.replace(REF_TOKEN_RE, "");

  if (citations.length === 0) {
    const paragraphs = splitParagraphs(stripped);
    return (
      <div lang={lang}>
        {paragraphs.map((p, i) => {
          const quoted = p.match(BLOCKQUOTE_DELIM_RE);
          if (quoted) {
            return (
              <blockquote key={i} style={blockquoteStyle}>
                {linkifyScriptureRefs(quoted[1])}
              </blockquote>
            );
          }
          return (
            <p key={i} style={paraStyle}>
              {linkifyScriptureRefs(p)}
            </p>
          );
        })}
      </div>
    );
  }

  const sorted = citations
    .filter((c) => c.span_start >= 0 && c.span_end <= stripped.length && c.span_end > c.span_start)
    .slice()
    .sort((a, b) => a.span_start - b.span_start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const c of sorted) {
    if (c.span_start < cursor) continue;
    if (c.span_start > cursor) parts.push(stripped.slice(cursor, c.span_start));
    const refText = stripped.slice(c.span_start, c.span_end);
    parts.push(
      <Link
        key={c.id}
        to={`/reader/bible/${c.book_slug}/${c.chapter}#v${c.verse_start}`}
        style={{ textDecorationThickness: "0.5px" }}
        title={`${c.book_slug} ${c.chapter}:${c.verse_start}`}
      >
        {refText}
      </Link>,
    );
    cursor = c.span_end;
  }
  if (cursor < stripped.length) parts.push(stripped.slice(cursor));
  return (
    <div lang={lang} style={{ whiteSpace: "pre-wrap" }}>
      {parts}
    </div>
  );
}
