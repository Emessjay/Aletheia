import type { VerseRow as VerseRowType } from "@/db/types";

interface Props {
  verse: VerseRowType;
  /** Render the first verse with a drop cap. */
  withDropCap?: boolean;
}

export function VerseRow({ verse, withDropCap }: Props) {
  // Strip the markup tokens (e.g. {strongs:G2316}) from the text_plain field.
  // For Phase 5 we use text_plain directly; tagged-token rendering lands in Phase 6.
  const body = verse.text_plain;

  if (withDropCap && body.length > 0) {
    const first = body.charAt(0);
    const rest = body.slice(1);
    return (
      <p className="al-verse" style={{ marginBottom: "0.6em" }}>
        <span className="al-verse-number">{verse.number}</span>
        <span className="al-drop-cap">{first}</span>
        {rest}
      </p>
    );
  }

  return (
    <p className="al-verse" style={{ marginBottom: "0.6em" }}>
      <span className="al-verse-number">{verse.number}</span>
      {body}
    </p>
  );
}
