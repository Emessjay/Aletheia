import { Link } from "react-router-dom";
import type { CitationRow } from "@/db/types";

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

const paraStyle: React.CSSProperties = {
  margin: "0 0 0.9em",
  lineHeight: 1.55,
};

export function SectionBody({ body, citations, lang }: Props) {
  const stripped = body.replace(REF_TOKEN_RE, "");

  if (citations.length === 0) {
    const paragraphs = stripped
      .split(PARAGRAPH_BREAK_RE)
      .map((p) => p.replace(INTERNAL_WS_RE, " ").trim())
      .filter((p) => p.length > 0);
    return (
      <div lang={lang}>
        {paragraphs.map((p, i) => (
          <p key={i} style={paraStyle}>
            {p}
          </p>
        ))}
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
