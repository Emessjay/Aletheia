import { Link } from "react-router-dom";
import type { CitationRow } from "@/db/types";

interface Props {
  body: string;
  citations: CitationRow[];
  lang?: string;
}

/**
 * Render a section body, splitting on citation spans. Each citation becomes a
 * Link to /reader/bible/{book}/{chapter}#v{verse_start}. Spans that overlap or
 * are out-of-range are skipped quietly — the citation table is best-effort.
 *
 * ThMLParser emits `{ref:PASSAGE}` inline tokens for every <scripRef> in the
 * source, but the visible passage text immediately follows the token, so
 * keeping both reads like double-print. Strip the tokens at render. (This is
 * only safe because none of the works that carry these tokens — Trypho,
 * Confessions, etc. — also have rows in the citation table, so there are no
 * spans whose offsets would shift.)
 */
const REF_TOKEN_RE = /\{ref:[^}]*\}/g;

export function SectionBody({ body, citations, lang }: Props) {
  const cleaned = body.replace(REF_TOKEN_RE, "");
  const sorted = citations
    .filter((c) => c.span_start >= 0 && c.span_end <= cleaned.length && c.span_end > c.span_start)
    .slice()
    .sort((a, b) => a.span_start - b.span_start);

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const c of sorted) {
    if (c.span_start < cursor) continue; // overlap; skip
    if (c.span_start > cursor) {
      parts.push(cleaned.slice(cursor, c.span_start));
    }
    const refText = cleaned.slice(c.span_start, c.span_end);
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
  if (cursor < cleaned.length) parts.push(cleaned.slice(cursor));

  return (
    <div lang={lang} style={{ whiteSpace: "pre-wrap" }}>
      {parts.length > 0 ? parts : cleaned}
    </div>
  );
}
