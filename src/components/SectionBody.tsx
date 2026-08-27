import { Link } from "react-router-dom";
import type { CitationRow } from "@/db/types";
import { parseReference } from "@/domain/reference";
import { findScriptureReferences } from "@/domain/scriptureRefs";

interface Props {
  body: string;
  citations?: CitationRow[];
  lang?: string;
}

/**
 * Render a section body with the structural markup that the ThML parser
 * preserves as inline curly-brace tokens. See `docs/formatting-rules.md`
 * for the full vocabulary (must stay in sync with `ThMLParser.swift`).
 */
const PARAGRAPH_BREAK_RE = /\n{2,}/g;
const INTERNAL_WS_RE = /\s+/g;
const MIGNE_MARKER_SPLIT_RE =
  /(?<=[.!?…”’")\]])\s+(?=\d{1,3}\.\s+[A-Z“"‘'])/g;
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
const h2Style: React.CSSProperties = {
  fontSize: 19,
  fontWeight: 600,
  lineHeight: 1.3,
  margin: "1.6em 0 0.5em",
  color: "var(--color-fg)",
};
const h3Style: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 600,
  lineHeight: 1.3,
  margin: "1.4em 0 0.4em",
  color: "var(--color-fg)",
};
const h4Style: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.3,
  margin: "1.2em 0 0.3em",
  color: "var(--color-fg-muted)",
};
const fnAnchorStyle: React.CSSProperties = {
  fontSize: "0.7em",
  verticalAlign: "super",
  lineHeight: 0,
  margin: "0 1px",
  textDecoration: "none",
  color: "var(--color-accent)",
};
const footnotesWrapStyle: React.CSSProperties = {
  marginTop: "2.25rem",
  paddingTop: "1rem",
  borderTop: "1px solid var(--color-rule)",
  fontSize: 14,
  lineHeight: 1.5,
  color: "var(--color-fg-muted)",
};

type Node =
  | { kind: "text"; value: string }
  | { kind: "em"; children: Node[] }
  | { kind: "b"; children: Node[] }
  | { kind: "q"; children: Node[] }
  | { kind: "h"; level: 2 | 3 | 4; children: Node[] }
  | { kind: "fn"; id: string; children: Node[] }
  | { kind: "ref"; passage: string; children: Node[] };

const TOKEN_RE =
  /\{(?:(em|b|q|h2|h3|h4|fn|ref)(?::([^}]*))?|\/(em|b|q|h|fn|ref))\}/g;

interface OpenFrame {
  node: Extract<Node, { children: Node[] }>;
  closer: string;
}

function linkifyScriptureRefs(text: string, keyPrefix: string): React.ReactNode {
  const hits = findScriptureReferences(text);
  if (hits.length === 0) return text;
  const out: React.ReactNode[] = [];
  let cursor = 0;
  hits.forEach((hit, i) => {
    if (hit.start > cursor) out.push(text.slice(cursor, hit.start));
    out.push(
      <Link
        key={`${keyPrefix}-${i}-${hit.start}`}
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

function tokenize(input: string): Node[] {
  const root: Node[] = [];
  const stack: OpenFrame[] = [];
  const top = (): Node[] =>
    stack.length === 0 ? root : stack[stack.length - 1].node.children;

  let cursor = 0;
  TOKEN_RE.lastIndex = 0;
  for (;;) {
    const m = TOKEN_RE.exec(input);
    if (!m) break;
    if (m.index > cursor) {
      top().push({ kind: "text", value: input.slice(cursor, m.index) });
    }
    const openTag = m[1];
    const arg = m[2];
    const closeTag = m[3];
    if (closeTag) {
      const idx = findOpenerIndex(stack, closeTag);
      if (idx >= 0) {
        while (stack.length > idx + 1) stack.pop();
        stack.pop();
      }
    } else if (openTag) {
      let node: Extract<Node, { children: Node[] }>;
      if (openTag === "em") node = { kind: "em", children: [] };
      else if (openTag === "b") node = { kind: "b", children: [] };
      else if (openTag === "q") node = { kind: "q", children: [] };
      else if (openTag === "h2") node = { kind: "h", level: 2, children: [] };
      else if (openTag === "h3") node = { kind: "h", level: 3, children: [] };
      else if (openTag === "h4") node = { kind: "h", level: 4, children: [] };
      else if (openTag === "fn")
        node = { kind: "fn", id: arg ?? "", children: [] };
      else if (openTag === "ref")
        node = { kind: "ref", passage: arg ?? "", children: [] };
      else {
        cursor = m.index + m[0].length;
        continue;
      }
      top().push(node);
      stack.push({ node, closer: openTag });
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < input.length) {
    top().push({ kind: "text", value: input.slice(cursor) });
  }
  return root;
}

function findOpenerIndex(stack: OpenFrame[], closer: string): number {
  if (closer === "h") {
    for (let i = stack.length - 1; i >= 0; i--) {
      const open = stack[i].closer;
      if (open === "h2" || open === "h3" || open === "h4") return i;
    }
    return -1;
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].closer === closer) return i;
  }
  return -1;
}

interface RenderState {
  footnotes: Array<{ marker: number; id: string; children: Node[] }>;
  nextKey: () => string;
}

function newState(): RenderState {
  let i = 0;
  return {
    footnotes: [],
    nextKey: () => `n${i++}`,
  };
}

function renderBlockSequence(
  nodes: Node[],
  state: RenderState,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let inlineBuf: Node[] = [];

  const flushInline = () => {
    if (inlineBuf.length === 0) return;
    const paragraphs = splitInlineIntoParagraphs(inlineBuf);
    for (const p of paragraphs) {
      if (p.length === 0) continue;
      const inline = p.map((n) => renderInline(n, state));
      const joined = inlineNodesToString(p);
      const quoted = joined.match(BLOCKQUOTE_DELIM_RE);
      if (quoted) {
        const key = state.nextKey();
        out.push(
          <blockquote key={key} className="al-section-blockquote" style={blockquoteStyle}>
            {linkifyScriptureRefs(quoted[1], key)}
          </blockquote>,
        );
      } else {
        out.push(
          <p key={state.nextKey()} style={paraStyle}>
            {inline}
          </p>,
        );
      }
    }
    inlineBuf = [];
  };

  for (const n of nodes) {
    if (n.kind === "h") {
      flushInline();
      const style = n.level === 2 ? h2Style : n.level === 3 ? h3Style : h4Style;
      const Tag = (`h${n.level}` as unknown) as React.ElementType;
      out.push(
        <Tag key={state.nextKey()} style={style}>
          {n.children.map((c) => renderInline(c, state))}
        </Tag>,
      );
    } else if (n.kind === "q" && shouldRenderQAsBlock(n, inlineBuf)) {
      flushInline();
      out.push(
        <blockquote key={state.nextKey()} className="al-section-blockquote" style={blockquoteStyle}>
          {renderBlockSequence(n.children, state)}
        </blockquote>,
      );
    } else {
      inlineBuf.push(n);
    }
  }
  flushInline();
  return out;
}

function shouldRenderQAsBlock(n: Node, inlineBuf: Node[]): boolean {
  if (nodeContainsParagraphBreak(n)) return true;
  if (inlineBuf.length === 0) return true;
  const tail = inlineBuf[inlineBuf.length - 1];
  if (tail.kind === "text" && /\n\n\s*$/.test(tail.value)) return true;
  if (
    inlineBuf.every(
      (m) => m.kind === "text" && /^\s*$/.test((m as { value: string }).value),
    )
  ) {
    return true;
  }
  return false;
}

function nodeContainsParagraphBreak(n: Node): boolean {
  if (n.kind === "text") return /\n\n/.test(n.value);
  if ("children" in n) return n.children.some(nodeContainsParagraphBreak);
  return false;
}

function splitInlineIntoParagraphs(nodes: Node[]): Node[][] {
  const groups: Node[][] = [];
  let current: Node[] = [];
  for (const n of nodes) {
    if (n.kind === "text") {
      const parts = n.value.split(PARAGRAPH_BREAK_RE);
      for (let i = 0; i < parts.length; i++) {
        const piece = parts[i].replace(INTERNAL_WS_RE, " ");
        if (i > 0) {
          groups.push(current);
          current = [];
        }
        if (piece.length === 0) continue;
        current.push({ kind: "text", value: piece });
      }
    } else {
      current.push(n);
    }
  }
  if (current.length > 0) groups.push(current);
  const expanded: Node[][] = [];
  for (const g of groups) expanded.push(...applyMigneSplit(g));
  return expanded
    .map(trimGroupEnds)
    .filter((g) =>
      g.some((n) => !(n.kind === "text" && n.value.trim() === "")),
    );
}

function applyMigneSplit(group: Node[]): Node[][] {
  const out: Node[][] = [[]];
  for (const n of group) {
    if (n.kind === "text") {
      const parts = n.value.split(MIGNE_MARKER_SPLIT_RE);
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) out.push([]);
        const piece = parts[i];
        if (piece.length > 0) out[out.length - 1].push({ kind: "text", value: piece });
      }
    } else {
      out[out.length - 1].push(n);
    }
  }
  return out;
}

function trimGroupEnds(group: Node[]): Node[] {
  const result = group.slice();
  if (result.length > 0 && result[0].kind === "text") {
    const first = result[0] as { kind: "text"; value: string };
    const trimmed = first.value.replace(/^\s+/, "");
    if (trimmed.length === 0) result.shift();
    else result[0] = { kind: "text", value: trimmed };
  }
  if (result.length > 0 && result[result.length - 1].kind === "text") {
    const last = result[result.length - 1] as { kind: "text"; value: string };
    const trimmed = last.value.replace(/\s+$/, "");
    if (trimmed.length === 0) result.pop();
    else result[result.length - 1] = { kind: "text", value: trimmed };
  }
  return result;
}

function inlineNodesToString(nodes: Node[]): string {
  let s = "";
  for (const n of nodes) {
    if (n.kind === "text") s += n.value;
    else if ("children" in n) s += inlineNodesToString(n.children);
  }
  return s;
}

function renderInline(node: Node, state: RenderState): React.ReactNode {
  if (node.kind === "text") {
    const key = state.nextKey();
    return <span key={key}>{linkifyScriptureRefs(node.value, key)}</span>;
  }
  if (node.kind === "em") {
    return (
      <em key={state.nextKey()}>
        {node.children.map((c) => renderInline(c, state))}
      </em>
    );
  }
  if (node.kind === "b") {
    return (
      <strong key={state.nextKey()}>
        {node.children.map((c) => renderInline(c, state))}
      </strong>
    );
  }
  if (node.kind === "q") {
    return (
      <q key={state.nextKey()}>
        {node.children.map((c) => renderInline(c, state))}
      </q>
    );
  }
  if (node.kind === "fn") {
    const marker = state.footnotes.length + 1;
    state.footnotes.push({ marker, id: node.id, children: node.children });
    return (
      <sup key={state.nextKey()} id={`fnref-${marker}`} style={fnAnchorStyle}>
        <a
          href={`#fn-${marker}`}
          style={fnAnchorStyle}
          title={inlineNodesToString(node.children)}
          aria-label={`Footnote ${marker}`}
        >
          {marker}
        </a>
      </sup>
    );
  }
  if (node.kind === "ref") {
    const key = state.nextKey();
    const parsed = parseReference(node.passage);
    const children = node.children.map((c, i) =>
      renderInlineNoLink(c, state, `${key}-${i}`),
    );
    if (!parsed) {
      return <span key={key}>{children}</span>;
    }
    return (
      <Link
        key={key}
        to={parsed.href}
        title={`${parsed.bookSlug} ${parsed.chapter}${parsed.verse !== null ? ":" + parsed.verse : ""}`}
      >
        {children}
      </Link>
    );
  }
  if (node.kind === "h") {
    return (
      <strong key={state.nextKey()}>
        {node.children.map((c) => renderInline(c, state))}
      </strong>
    );
  }
  return null;
}

function renderInlineNoLink(
  node: Node,
  state: RenderState,
  key: string,
): React.ReactNode {
  if (node.kind === "text") return <span key={key}>{node.value}</span>;
  if (node.kind === "em")
    return (
      <em key={key}>
        {node.children.map((c, i) => renderInlineNoLink(c, state, `${key}-${i}`))}
      </em>
    );
  if (node.kind === "b")
    return (
      <strong key={key}>
        {node.children.map((c, i) => renderInlineNoLink(c, state, `${key}-${i}`))}
      </strong>
    );
  if (node.kind === "q")
    return (
      <q key={key}>
        {node.children.map((c, i) => renderInlineNoLink(c, state, `${key}-${i}`))}
      </q>
    );
  if ("children" in node)
    return (
      <span key={key}>
        {node.children.map((c, i) => renderInlineNoLink(c, state, `${key}-${i}`))}
      </span>
    );
  return null;
}

function Footnotes({ entries }: { entries: RenderState["footnotes"] }) {
  if (entries.length === 0) return null;
  return (
    <aside className="al-section-footnotes" style={footnotesWrapStyle} aria-label="Footnotes">
      <ol style={{ paddingLeft: "1.6em", margin: 0 }}>
        {entries.map((e) => (
          <li key={e.marker} id={`fn-${e.marker}`} style={{ marginBottom: "0.4em" }}>
            <span>
              {e.children.map((c, i) => renderInlineForNote(c, `${e.marker}-${i}`))}
            </span>{" "}
            <a
              href={`#fnref-${e.marker}`}
              style={{ textDecoration: "none" }}
              aria-label={`Back to reference ${e.marker}`}
            >
              ↩
            </a>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function renderInlineForNote(node: Node, key: string): React.ReactNode {
  if (node.kind === "text") {
    return <span key={key}>{linkifyScriptureRefs(node.value, key)}</span>;
  }
  if (node.kind === "em")
    return (
      <em key={key}>
        {node.children.map((c, i) => renderInlineForNote(c, `${key}-${i}`))}
      </em>
    );
  if (node.kind === "b")
    return (
      <strong key={key}>
        {node.children.map((c, i) => renderInlineForNote(c, `${key}-${i}`))}
      </strong>
    );
  if (node.kind === "q")
    return (
      <q key={key}>
        {node.children.map((c, i) => renderInlineForNote(c, `${key}-${i}`))}
      </q>
    );
  if ("children" in node)
    return (
      <span key={key}>
        {node.children.map((c, i) => renderInlineForNote(c, `${key}-${i}`))}
      </span>
    );
  return null;
}

export function SectionBody({ body, citations = [], lang }: Props) {
  if (citations.length === 0) {
    const tree = tokenize(body);
    const state = newState();
    const rendered = renderBlockSequence(tree, state);
    return (
      <div className="al-section-body" lang={lang}>
        {rendered}
        <Footnotes entries={state.footnotes} />
      </div>
    );
  }

  const flat = stripAllTokens(body);
  const sorted = citations
    .filter(
      (c) =>
        c.span_start >= 0 && c.span_end <= flat.length && c.span_end > c.span_start,
    )
    .slice()
    .sort((a, b) => a.span_start - b.span_start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const c of sorted) {
    if (c.span_start < cursor) continue;
    if (c.span_start > cursor) parts.push(flat.slice(cursor, c.span_start));
    const refText = flat.slice(c.span_start, c.span_end);
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
  if (cursor < flat.length) parts.push(flat.slice(cursor));
  return (
    <div className="al-section-body" lang={lang} style={{ whiteSpace: "pre-wrap" }}>
      {parts}
    </div>
  );
}

function stripAllTokens(s: string): string {
  return s.replace(TOKEN_RE, "");
}

export const _testing = { tokenize, stripAllTokens };
