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
}: Props) {
  const langAttr = LANG_ATTR[language];

  const hl =
    highlights?.find((h) => h.translation === null) ?? highlights?.[0] ?? null;
  const hlClass = hl ? `al-hl al-hl-${hl.color}` : null;
  const hasNote = (notes?.length ?? 0) > 0;

  const body = renderBody({
    verse,
    words,
    language,
    withDropCap,
    onOpenStrongs,
  });

  const wrapperClass =
    [
      "al-verse-inline",
      hlClass,
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
        {body}
      </span>{" "}
    </>
  );
}

function renderBody({
  verse,
  words,
  language,
  withDropCap,
  onOpenStrongs,
}: {
  verse: VerseRowType;
  words?: WordRow[];
  language: CorpusLanguage;
  withDropCap?: boolean;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
}) {
  if ((language === "he" || language === "gk") && words && words.length > 0) {
    const tokenLang = language === "he" ? "he" : "grc";
    // Drop cap on the first verse: peel off the first character of the first
    // word, render it floated, and pass the rest to the WordToken so the
    // Strong's hook still works on the remainder of the word. Hebrew flows
    // RTL, so a drop-capped initial would interrupt the script direction;
    // skip the float there.
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
    return (
      <>
        <span className="al-drop-cap">{text.charAt(0)}</span>
        {text.slice(1)}
      </>
    );
  }
  return text;
}
