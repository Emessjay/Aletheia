import { useEffect } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useChapter } from "@/db/hooks";
import type { CorpusLanguage } from "@/db/types";
import { kvSet } from "@/db/user";
import { isTauri } from "@/lib/tauri";
import { VerseRow } from "./VerseRow";
import { ChapterNav } from "./ChapterNav";

// Phase 5: BSB only. The translation switcher lands in Phase 6.
const PHASE_5_LANGUAGE: CorpusLanguage = "en_bsb";

export function ReaderRoute() {
  const { work = "", book = "", chapter = "" } = useParams();
  const chapterNum = Number(chapter);
  const valid = Boolean(work && book && Number.isFinite(chapterNum) && chapterNum >= 1);

  // Hook order must be stable; call useChapter unconditionally with safe placeholders.
  const q = useChapter(PHASE_5_LANGUAGE, valid ? book : "", valid ? chapterNum : 1);

  if (!valid) {
    return <Navigate to="/reader/bible/john/1" replace />;
  }

  // Persist last reading position whenever a chapter loads successfully.
  useEffect(() => {
    if (!isTauri() || !q.data) return;
    void kvSet(
      "reader.last",
      JSON.stringify({ work, book, chapter: chapterNum }),
    );
  }, [work, book, chapterNum, q.data]);

  if (!isTauri()) {
    return (
      <article style={readerWrap}>
        <p style={{ color: "var(--color-fg-muted)" }}>
          Run <code>npm run tauri dev</code> to read the corpus. Browser-only
          dev mode cannot reach the SQLite plugin.
        </p>
      </article>
    );
  }

  if (q.isPending) {
    return <article style={readerWrap}><p style={{ color: "var(--color-fg-muted)" }}>Loading…</p></article>;
  }
  if (q.isError) {
    return (
      <article style={readerWrap}>
        <pre style={{ color: "var(--color-accent)" }}>
          {String(q.error)}
        </pre>
      </article>
    );
  }
  if (!q.data) {
    return (
      <article style={readerWrap}>
        <p style={{ color: "var(--color-fg-muted)" }}>
          No such reference: {work}/{book}/{chapter}
        </p>
      </article>
    );
  }

  const { book: bookRow, chapter: chapterRow, verses, chapterNumbers } = q.data;

  return (
    <article style={readerWrap}>
      <header style={{ marginBottom: "1.5rem" }}>
        <p className="al-eyebrow">{bookRow.name}</p>
        <p className="al-chapter-label" style={{ marginTop: 4 }}>
          Chapter {toRoman(chapterRow.number)}
        </p>
      </header>

      <div>
        {verses.map((v, i) => (
          <VerseRow key={v.id} verse={v} withDropCap={i === 0} />
        ))}
      </div>

      <ChapterNav
        workSlug={work}
        bookSlug={book}
        current={chapterNum}
        all={chapterNumbers}
      />
    </article>
  );
}

const readerWrap: React.CSSProperties = {
  maxWidth: "var(--measure)",
  margin: "0 auto",
  padding: "2.5rem 2rem 6rem",
};

const ROMAN: Array<[number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

function toRoman(n: number): string {
  if (n < 1) return String(n);
  let out = "";
  for (const [v, s] of ROMAN) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}
