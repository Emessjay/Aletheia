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

export function VerseRow({
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

  // Pick the universal (translation = null) highlight first; otherwise any.
  const hl =
    highlights?.find((h) => h.translation === null) ?? highlights?.[0] ?? null;
  const hasNote = (notes?.length ?? 0) > 0;
  const annotated = !!hl || hasNote;

  const innerStyle: React.CSSProperties = {
    marginBottom: "0.6em",
    cursor: onSelect ? "pointer" : "default",
    background: selected ? "var(--color-bg-inset)" : undefined,
    transition: "background 80ms",
  };

  const gutterTick = annotated ? (
    <span
      aria-hidden="true"
      title={hasNote ? "Has note" : "Highlighted"}
      style={{
        position: "absolute",
        left: -10,
        top: "0.5em",
        width: 2,
        height: "0.9em",
        background: "var(--color-accent)",
      }}
    />
  ) : null;

  const verseNumber = (
    <span className="al-verse-number">{verse.number}</span>
  );

  const body = renderBody({ verse, words, language, withDropCap, hl, onOpenStrongs });

  return (
    <p
      className="al-verse"
      id={`v${verse.number}`}
      style={innerStyle}
      lang={langAttr}
      onClick={onSelect}
    >
      {gutterTick}
      {verseNumber}
      {body}
    </p>
  );
}

function renderBody({
  verse,
  words,
  language,
  withDropCap,
  hl,
  onOpenStrongs,
}: {
  verse: VerseRowType;
  words?: WordRow[];
  language: CorpusLanguage;
  withDropCap?: boolean;
  hl: HighlightRow | null;
  onOpenStrongs: (id: string, rect: DOMRect) => void;
}) {
  const hlClass = hl ? `al-hl al-hl-${hl.color}` : undefined;

  // Hebrew: tokenized words.
  if (language === "he" && words && words.length > 0) {
    const inner = words.map((w, i) => (
      <WordToken
        key={`${w.id}-${i}`}
        surface={w.surface}
        strongs={w.strongs}
        lang="he"
        onOpen={onOpenStrongs}
      />
    ));
    return hlClass ? <span className={hlClass}>{inner}</span> : <>{inner}</>;
  }

  // Plain prose for everything else.
  const text = verse.text_plain;
  if (withDropCap && text.length > 0) {
    const first = text.charAt(0);
    const rest = text.slice(1);
    const inner = (
      <>
        <span className="al-drop-cap">{first}</span>
        {rest}
      </>
    );
    return hlClass ? <span className={hlClass}>{inner}</span> : inner;
  }

  return hlClass ? <span className={hlClass}>{text}</span> : <>{text}</>;
}
