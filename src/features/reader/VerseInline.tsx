import type { ReactNode } from "react";
import type {
  CorpusLanguage,
  HighlightRow,
  NoteRow,
  VerseRow as VerseRowType,
  WordRow,
} from "@/db/types";
import { WordToken } from "./WordToken";

interface Props {
  verse: VerseRowType;
  words?: WordRow[];
  language: CorpusLanguage;
  /** Render the first verse of a chapter with a drop cap. */
  withDropCap?: boolean;
  highlights?: HighlightRow[];
  notes?: NoteRow[];
  selected?: boolean;
  onSelect?: () => void;
  onOpenStrongs: (strongsId: string, rect: DOMRect) => void;
  onOpenHighlight?: (highlightId: string, rect: DOMRect) => void;
}

const LANG_ATTR: Partial<Record<CorpusLanguage, string>> = {
  he: "he",
  gk: "grc",
  la: "la",
};

/**
 * One verse rendered inline so consecutive verses can share lines (the way a
 * printed Bible flows). The preceding `<span data-spacer>` is an inline,
 * zero-size hook that the alignment effect can flip to `display: block` with a
 * computed height when verses need to be pushed down to line up with the
 * corresponding verse in another column.
 */
export function VerseInline({
  verse,
  words,
  language,
  withDropCap,
  highlights,
  notes,
  selected,
  onSelect,
  onOpenStrongs,
  onOpenHighlight,
}: Props) {
  const langAttr = LANG_ATTR[language];

  // Verse-level highlights (no character range): universal first, else any.
  const fullVerse = (highlights ?? []).filter(
    (h) => h.start_token == null || h.end_token == null,
  );
  const fullHl =
    fullVerse.find((h) => h.translation === null) ?? fullVerse[0] ?? null;
  const fullHlClass = fullHl ? `al-hl al-hl-${fullHl.color}` : null;
  const partials = (highlights ?? []).filter(
    (h): h is HighlightRow & { start_token: number; end_token: number } =>
      h.start_token != null && h.end_token != null,
  );
  const hasNote = (notes?.length ?? 0) > 0;

  const body = renderBody({
    verse,
    words,
    language,
    withDropCap,
    partials,
    onOpenStrongs,
    onOpenHighlight,
  });

  const wrapperClass =
    [
      "al-verse-inline",
      fullHlClass,
      selected ? "al-verse-selected" : null,
      hasNote ? "al-verse-noted" : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <>
      <span className="al-verse-spacer" data-spacer={verse.number} />
      <span
        className={wrapperClass}
        data-verse-text={verse.number}
        lang={langAttr}
        onClick={onSelect}
        style={onSelect ? { cursor: "pointer" } : undefined}
      >
        <sup
          id={`v${verse.number}`}
          data-verse-anchor={verse.number}
          className="al-verse-num-inline"
          aria-hidden={withDropCap ? true : undefined}
          style={
            withDropCap
              ? { position: "absolute", width: 0, height: 0, overflow: "hidden", clip: "rect(0 0 0 0)" }
              : undefined
          }
        >
          {verse.number}
        </sup>
        <span data-verse-body={verse.number}>{body}</span>
      </span>{" "}
    </>
  );
}

interface PartialHl {
  id: string;
  color: HighlightRow["color"];
  start_token: number;
  end_token: number;
}

function renderBody({
  verse,
  words,
  language,
  withDropCap,
  partials,
  onOpenStrongs,
  onOpenHighlight,
}: {
  verse: VerseRowType;
  words?: WordRow[];
  language: CorpusLanguage;
  withDropCap?: boolean;
  partials: PartialHl[];
  onOpenStrongs: (id: string, rect: DOMRect) => void;
  onOpenHighlight?: (highlightId: string, rect: DOMRect) => void;
}) {
  // Tokenized languages (Hebrew/Greek): partial highlights not supported in
  // v1 — the per-word renderer doesn't line up character-for-character with
  // text_plain. Render the existing token stream.
  if ((language === "he" || language === "gk") && words && words.length > 0) {
    const tokenLang = language === "he" ? "he" : "grc";
    if (withDropCap && language === "gk") {
      const [first, ...rest] = words;
      const firstChar = first.surface.charAt(0);
      const firstRest = first.surface.slice(1);
      return (
        <>
          <span className="al-drop-cap" lang={tokenLang}>
            {firstChar}
          </span>
          <WordToken
            key={`${first.id}-0`}
            surface={firstRest}
            strongs={first.strongs}
            lang={tokenLang}
            onOpen={onOpenStrongs}
          />
          {rest.map((w, i) => (
            <WordToken
              key={`${w.id}-${i + 1}`}
              surface={w.surface}
              strongs={w.strongs}
              lang={tokenLang}
              onOpen={onOpenStrongs}
            />
          ))}
        </>
      );
    }
    return (
      <>
        {words.map((w, i) => (
          <WordToken
            key={`${w.id}-${i}`}
            surface={w.surface}
            strongs={w.strongs}
            lang={tokenLang}
            onOpen={onOpenStrongs}
          />
        ))}
      </>
    );
  }

  const text = verse.text_plain;
  if (withDropCap && text.length > 0) {
    const head = renderRuns(text.slice(0, 1), 0, partials, onOpenHighlight, "drop-cap");
    const tail = renderRuns(text.slice(1), 1, partials, onOpenHighlight);
    return (
      <>
        {head}
        {tail}
      </>
    );
  }
  return <>{renderRuns(text, 0, partials, onOpenHighlight)}</>;
}

function renderRuns(
  text: string,
  baseOffset: number,
  partials: PartialHl[],
  onOpenHighlight: ((id: string, rect: DOMRect) => void) | undefined,
  variant?: "drop-cap",
): ReactNode[] {
  if (text.length === 0) return [];
  const end = baseOffset + text.length;
  const cuts = new Set<number>([baseOffset, end]);
  for (const h of partials) {
    if (h.end_token <= baseOffset || h.start_token >= end) continue;
    cuts.add(Math.max(baseOffset, h.start_token));
    cuts.add(Math.min(end, h.end_token));
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (lo === hi) continue;
    const slice = text.slice(lo - baseOffset, hi - baseOffset);
    const hit = [...partials]
      .reverse()
      .find((h) => h.start_token <= lo && h.end_token >= hi);
    const key = `r-${lo}-${hi}`;
    if (variant === "drop-cap") {
      nodes.push(
        <span
          key={key}
          className={"al-drop-cap" + (hit ? ` al-hl al-hl-${hit.color}` : "")}
          data-char-start={lo}
          data-char-end={hi}
          data-highlight-id={hit?.id}
          onClick={
            hit && onOpenHighlight
              ? (e) => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  onOpenHighlight(hit.id, rect);
                }
              : undefined
          }
        >
          {slice}
        </span>,
      );
    } else if (hit) {
      nodes.push(
        <span
          key={key}
          className={`al-hl al-hl-${hit.color}`}
          data-char-start={lo}
          data-char-end={hi}
          data-highlight-id={hit.id}
          onClick={(e) => {
            if (!onOpenHighlight) return;
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onOpenHighlight(hit.id, rect);
          }}
          style={{ cursor: "pointer" }}
        >
          {slice}
        </span>,
      );
    } else {
      nodes.push(
        <span key={key} data-char-start={lo} data-char-end={hi}>
          {slice}
        </span>,
      );
    }
  }
  return nodes;
}
