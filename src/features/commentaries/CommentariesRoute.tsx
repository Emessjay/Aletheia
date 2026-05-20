import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  useChapter,
  useChapterCommentary,
  useCommentaries,
  useCommentaryBookIntro,
  useCommentaryBooks,
  useCommentaryChapters,
} from "@/db/hooks";
import { commentaryReferenceTranslation } from "@/domain/translations";
import type { ChapterPayload } from "@/db/queries";
import type { SectionRow, WorkRow } from "@/db/types";

/**
 * /commentaries                              → list all commentaries
 * /commentaries/:work                        → list books in a commentary
 * /commentaries/:work/:book                  → list chapters in a book
 * /commentaries/:work/:book/:chapter         → read the chapter's commentary
 */
export function CommentariesRoute() {
  const params = useParams();
  const work = params.work ?? null;
  const book = params.book ?? null;
  const chapterParam = params.chapter ?? null;
  const chapter = chapterParam ? Number.parseInt(chapterParam, 10) : null;

  if (work && book && chapter && Number.isFinite(chapter)) {
    return <ChapterView workSlug={work} bookSlug={book} chapter={chapter} />;
  }
  if (work && book) {
    return <BookView workSlug={work} bookSlug={book} />;
  }
  if (work) {
    return <WorkView workSlug={work} />;
  }
  return <IndexView />;
}

// ── /commentaries (index) ────────────────────────────────────────────────

function IndexView() {
  const commentaries = useCommentaries();
  const data = commentaries.data ?? [];

  if (commentaries.isPending) return <Loading />;
  if (commentaries.isError) return <Failure error={commentaries.error} />;
  if (data.length === 0) {
    return (
      <article style={wrap}>
        <Header eyebrow="Commentaries" title="Historic biblical commentaries" />
        <p style={{ color: "var(--color-fg-muted)" }}>
          No commentaries are bundled in this corpus yet. Run the ingest
          pipeline to populate them.
        </p>
      </article>
    );
  }

  return (
    <article style={wrap}>
      <Header eyebrow="Commentaries" title="Historic biblical commentaries" />
      <ul style={listReset}>
        {data.map((w) => (
          <li key={w.id} style={rowItem}>
            <Link to={`/commentaries/${w.slug}`} style={linkReset}>
              <h2 style={workTitle}>{w.title}</h2>
              <p style={metaLine}>{w.author}</p>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

// ── /commentaries/:work — list books ─────────────────────────────────────

function WorkView({ workSlug }: { workSlug: string }) {
  const work = useCommentaryEntry(workSlug);
  const books = useCommentaryBooks(workSlug);

  if (books.isPending || work.isPending) return <Loading />;
  if (books.isError) return <Failure error={books.error} />;

  return (
    <article style={wrap}>
      <Header
        eyebrow={
          <Link to="/commentaries" style={crumbLink}>
            ← Commentaries
          </Link>
        }
        title={work.data?.title ?? workSlug}
        sub={work.data?.author ?? undefined}
      />
      <ul style={listReset}>
        {(books.data ?? []).map((b) => (
          <li key={b.book_slug} style={rowItem}>
            <Link
              to={`/commentaries/${workSlug}/${b.book_slug}`}
              style={linkReset}
            >
              <h2 style={bookTitle}>{b.book_name}</h2>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

// ── /commentaries/:work/:book — list chapters, auto-pick chapter 1 ───────

function BookView({
  workSlug,
  bookSlug,
}: {
  workSlug: string;
  bookSlug: string;
}) {
  const work = useCommentaryEntry(workSlug);
  const books = useCommentaryBooks(workSlug);
  const chapters = useCommentaryChapters(workSlug, bookSlug);
  const intro = useCommentaryBookIntro(workSlug, bookSlug);
  const numbers = useMemo(
    () => chapterNumbersFromSections(chapters.data ?? []),
    [chapters.data],
  );

  // Wait for both queries: showing the intro landing depends on knowing
  // whether intro.data is non-empty, so we don't want to render-then-flicker.
  if (chapters.isPending || intro.isPending) return <Loading />;
  if (chapters.isError) return <Failure error={chapters.error} />;

  const introBody = (intro.data ?? "").trim();

  // No intro: keep the legacy auto-redirect to chapter 1 — there's nothing
  // to read at the book level on its own.
  if (!introBody && numbers.length > 0) {
    return (
      <Navigate
        to={`/commentaries/${workSlug}/${bookSlug}/${numbers[0]}`}
        replace
      />
    );
  }

  if (!introBody && numbers.length === 0) {
    return (
      <article style={wrap}>
        <Header
          eyebrow={
            <Link to={`/commentaries/${workSlug}`} style={crumbLink}>
              ← {workSlug}
            </Link>
          }
          title={bookSlug}
        />
        <p style={{ color: "var(--color-fg-muted)" }}>
          No chapters available for this book.
        </p>
      </article>
    );
  }

  const bookName =
    (books.data ?? []).find((b) => b.book_slug === bookSlug)?.book_name ??
    bookSlug;

  return (
    <article style={wrap}>
      <Header
        eyebrow={
          <span>
            <Link to="/commentaries" style={crumbLink}>
              Commentaries
            </Link>
            {" · "}
            <Link to={`/commentaries/${workSlug}`} style={crumbLink}>
              {work.data?.title ?? workSlug}
            </Link>
          </span>
        }
        title={bookName}
        sub="Book introduction"
      />
      <SectionBody body={introBody} />
      {numbers.length > 0 ? (
        <nav style={chapterNav}>
          <div />
          <div>
            <Link
              to={`/commentaries/${workSlug}/${bookSlug}/${numbers[0]}`}
              style={linkReset}
            >
              Chapter {numbers[0]} →
            </Link>
          </div>
        </nav>
      ) : null}
    </article>
  );
}

// ── /commentaries/:work/:book/:chapter ───────────────────────────────────

function ChapterView({
  workSlug,
  bookSlug,
  chapter,
}: {
  workSlug: string;
  bookSlug: string;
  chapter: number;
}) {
  const work = useCommentaryEntry(workSlug);
  const books = useCommentaryBooks(workSlug);
  const chapters = useCommentaryChapters(workSlug, bookSlug);
  const sections = useChapterCommentary(workSlug, bookSlug, chapter);
  const refTranslation = commentaryReferenceTranslation();
  const refChapter = useChapter(refTranslation.id, bookSlug, chapter);

  const [openCommentId, setOpenCommentId] = useState<number | null>(null);
  // Reset selection when the user navigates between chapters / books / works.
  useEffect(() => setOpenCommentId(null), [workSlug, bookSlug, chapter]);

  const bookEntry = (books.data ?? []).find((b) => b.book_slug === bookSlug);
  const numbers = useMemo(
    () => chapterNumbersFromSections(chapters.data ?? []),
    [chapters.data],
  );
  const idx = numbers.indexOf(chapter);
  const prev = idx > 0 ? numbers[idx - 1] : null;
  const next = idx >= 0 && idx < numbers.length - 1 ? numbers[idx + 1] : null;

  const list = sections.data ?? [];
  const chapterIntro = list.find((s) => s.kind === "chapter");
  const comments = useMemo(
    () => list.filter((s) => s.kind === "comment"),
    [list],
  );
  // verse number → comment section. A "Verses 1–3" comment registers under
  // 1, 2, and 3 (the first match wins, so we don't double-register if two
  // ranges overlap — that would be a data bug anyway).
  const commentByVerse = useMemo(() => {
    const m = new Map<number, SectionRow>();
    for (const c of comments) {
      for (const v of parseVerseLabel(c.label ?? "")) {
        if (!m.has(v)) m.set(v, c);
      }
    }
    return m;
  }, [comments]);

  const openComment = openCommentId
    ? comments.find((c) => c.id === openCommentId) ?? null
    : null;
  // Highlight all verses that the open comment covers (for ranges like
  // "Verses 1–3" we want every one of those verses styled, not just the
  // one the user clicked on).
  const activeVerses = useMemo(() => {
    if (!openComment) return new Set<number>();
    return new Set(parseVerseLabel(openComment.label ?? ""));
  }, [openComment]);

  const header = (
    <Header
      eyebrow={
        <span>
          <Link to="/commentaries" style={crumbLink}>
            Commentaries
          </Link>
          {" · "}
          <Link to={`/commentaries/${workSlug}`} style={crumbLink}>
            {work.data?.title ?? workSlug}
          </Link>
        </span>
      }
      title={`${bookEntry?.book_name ?? bookSlug} ${chapter}`}
    />
  );

  const chapterNavEl = (
    <nav style={chapterNav}>
      <div>
        {prev ? (
          <Link
            to={`/commentaries/${workSlug}/${bookSlug}/${prev}`}
            style={linkReset}
          >
            ← Chapter {prev}
          </Link>
        ) : null}
      </div>
      <div>
        {next ? (
          <Link
            to={`/commentaries/${workSlug}/${bookSlug}/${next}`}
            style={linkReset}
          >
            Chapter {next} →
          </Link>
        ) : null}
      </div>
    </nav>
  );

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        minHeight: 0,
        position: "relative",
      }}
    >
      <article style={textColumn}>
        {header}

        {chapterIntro && chapterIntro.body.trim() ? (
          <div style={{ marginBottom: "1.75rem" }}>
            <SectionBody body={chapterIntro.body} />
          </div>
        ) : null}

        {sections.isPending || refChapter.isPending ? (
          <p style={{ color: "var(--color-fg-muted)" }}>Loading…</p>
        ) : sections.isError ? (
          <Failure error={sections.error} />
        ) : refChapter.data ? (
          <ReferenceChapter
            chapter={refChapter.data}
            langAttr={refTranslation.language}
            commentByVerse={commentByVerse}
            activeVerses={activeVerses}
            onSelectVerse={(v) => {
              const c = commentByVerse.get(v);
              setOpenCommentId(c ? c.id : null);
            }}
          />
        ) : (
          <p style={{ color: "var(--color-fg-muted)" }}>
            {refTranslation.shortLabel} text not available for this chapter.
          </p>
        )}

        {comments.length === 0 && !chapterIntro?.body?.trim() ? (
          <p style={{ marginTop: "1.5rem", color: "var(--color-fg-muted)" }}>
            No commentary text available for this chapter.
          </p>
        ) : null}

        {chapterNavEl}
      </article>

      <CommentaryPanel
        comment={openComment}
        empty={comments.length === 0}
        onClose={() => setOpenCommentId(null)}
        bookSlug={bookSlug}
        chapter={chapter}
      />
    </div>
  );
}

/** Render the commentary-reference chapter inline-prose style. Each verse is
 *  one continuous span; verses that have commentary get a dotted underline
 *  and a click handler. The verse with the currently-open comment renders
 *  with a stronger accent so the reader can see which one is anchored. */
function ReferenceChapter({
  chapter,
  langAttr,
  commentByVerse,
  activeVerses,
  onSelectVerse,
}: {
  chapter: ChapterPayload;
  langAttr: string;
  commentByVerse: Map<number, SectionRow>;
  activeVerses: Set<number>;
  onSelectVerse: (verse: number) => void;
}) {
  return (
    <div className="al-chapter-flow" lang={langAttr}>
      {chapter.verses.map((v, i) => {
        const hasComment = commentByVerse.has(v.number);
        const isActive = activeVerses.has(v.number);
        const className = [
          "al-verse-inline",
          hasComment ? "al-commentary-verse" : null,
          isActive ? "is-active" : null,
        ]
          .filter(Boolean)
          .join(" ");
        const lead = i > 0 ? v.lead : null;
        return (
          <Fragment key={v.id}>
            {lead ? (
              <span
                className={`al-paragraph-lead al-paragraph-lead--${lead}`}
                data-lead={lead}
                aria-hidden="true"
              />
            ) : null}
            <span className="al-verse-spacer" data-spacer={v.number} />
            <span
              className={className}
              data-verse-text={v.number}
              onClick={hasComment ? () => onSelectVerse(v.number) : undefined}
            >
              <sup
                id={`v${v.number}`}
                data-verse-anchor={v.number}
                className="al-verse-num-inline"
              >
                {v.number}
              </sup>
              <span data-verse-body={v.number}>{v.text_plain}</span>
            </span>{" "}
          </Fragment>
        );
      })}
    </div>
  );
}

function CommentaryPanel({
  comment,
  empty,
  onClose,
  bookSlug,
  chapter,
}: {
  comment: SectionRow | null;
  empty: boolean;
  onClose: () => void;
  bookSlug: string;
  chapter: number;
}) {
  return (
    <aside style={panelOuter}>
      <div style={panelInner}>
        {comment ? (
          <>
            <header style={panelHeader}>
              <CommentLabel
                label={comment.label ?? ""}
                bookSlug={bookSlug}
                chapter={chapter}
              />
              <button
                type="button"
                aria-label="Close commentary panel"
                onClick={onClose}
                style={panelClose}
              >
                ×
              </button>
            </header>
            <SectionBody body={comment.body} />
          </>
        ) : (
          <p style={panelPlaceholder}>
            {empty
              ? "No commentary for this chapter."
              : "Click an underlined verse to read the commentary."}
          </p>
        )}
      </div>
    </aside>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────

function chapterNumbersFromSections(sections: SectionRow[]): number[] {
  const out: number[] = [];
  for (const s of sections) {
    const n = Number.parseInt(s.label ?? "", 10);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function useCommentaryEntry(slug: string) {
  const all = useCommentaries();
  return {
    ...all,
    data: (all.data ?? []).find((w: WorkRow) => w.slug === slug) ?? null,
  };
}

/** Comment headers like "Verse 12" or "Verses 1–3" become Links to the Bible
 *  reader, scrolled to the first verse referenced. Labels we can't parse
 *  (rare) render as plain text. */
function CommentLabel({
  label,
  bookSlug,
  chapter,
}: {
  label: string;
  bookSlug: string;
  chapter: number;
}) {
  const firstVerse = parseFirstVerse(label);
  if (firstVerse == null) {
    return <p style={commentLabel}>{label}</p>;
  }
  return (
    <p style={commentLabel}>
      <Link
        to={`/reader/bible/${bookSlug}/${chapter}#v${firstVerse}`}
        style={{ color: "inherit", textDecoration: "none" }}
      >
        {label}
      </Link>
    </p>
  );
}

function parseFirstVerse(label: string): number | null {
  // "Verse 12" / "Verses 1–3" / "Verses 1, 3" / "Ver. 12"
  const m = label.match(/(\d+)/);
  return m ? Number.parseInt(m[1], 10) : null;
}

/** Expand a comment label like "Verses 1–3" or "Verses 1, 3" into the list of
 *  verse numbers it covers. Matthew Henry uses ranges; SWORD modules use
 *  single verses ("Verse 12"). Anything we can't parse returns []. */
function parseVerseLabel(label: string): number[] {
  // Strip leading "Verse(s)" / "Ver." and optional trailing "."
  const stripped = label
    .trim()
    .replace(/^(?:Verses?|Ver\.)\s+/i, "")
    .replace(/\.+$/, "");
  if (!stripped) return [];
  const out: number[] = [];
  for (const part of stripped.split(/,\s*/)) {
    const range = part.match(/^(\d+)\s*[–—-]\s*(\d+)$/);
    if (range) {
      const lo = Number.parseInt(range[1], 10);
      const hi = Number.parseInt(range[2], 10);
      if (Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi && hi - lo < 200) {
        for (let v = lo; v <= hi; v++) out.push(v);
      }
      continue;
    }
    const single = part.match(/^(\d+)$/);
    if (single) out.push(Number.parseInt(single[1], 10));
  }
  return out;
}

function SectionBody({ body }: { body: string }) {
  // Ingest stores commentary text with paragraph breaks as double-newlines.
  // Split on those so we get real <p>'s with the same measure/leading the rest
  // of the reader uses.
  const paragraphs = body
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return (
    <div>
      {paragraphs.map((p, i) => (
        <p key={i} style={paraStyle}>
          {p}
        </p>
      ))}
    </div>
  );
}

function Header({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: React.ReactNode;
  title: string;
  sub?: string;
}) {
  return (
    <header style={{ marginBottom: "2rem" }}>
      <p className="al-eyebrow">{eyebrow}</p>
      <h1
        style={{
          fontSize: 28,
          fontStyle: "italic",
          marginTop: 4,
          color: "var(--color-fg)",
        }}
      >
        {title}
      </h1>
      {sub ? <p style={metaLine}>{sub}</p> : null}
    </header>
  );
}

function Loading() {
  return (
    <article style={wrap}>
      <p style={{ color: "var(--color-fg-muted)" }}>Loading…</p>
    </article>
  );
}

function Failure({ error }: { error: unknown }) {
  return (
    <article style={wrap}>
      <pre style={{ color: "var(--color-accent)" }}>{String(error)}</pre>
    </article>
  );
}

// ── styles ───────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  maxWidth: "var(--measure)",
  margin: "0 auto",
  padding: "2.5rem 2rem 6rem",
};
const listReset: React.CSSProperties = { listStyle: "none", padding: 0, margin: 0 };
const linkReset: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "inherit",
};
const rowItem: React.CSSProperties = {
  padding: "1.1rem 0",
  borderBottom: "1px solid var(--color-rule)",
};
const workTitle: React.CSSProperties = {
  fontSize: 22,
  fontStyle: "italic",
  margin: 0,
  color: "var(--color-fg)",
};
const bookTitle: React.CSSProperties = {
  fontSize: 18,
  margin: 0,
  color: "var(--color-fg)",
};
const metaLine: React.CSSProperties = {
  fontSize: 14,
  color: "var(--color-fg-muted)",
  margin: "4px 0 0",
};
const commentLabel: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--color-fg-muted)",
  margin: "0 0 6px",
};
const paraStyle: React.CSSProperties = {
  margin: "0 0 0.9rem",
  lineHeight: 1.55,
  color: "var(--color-fg)",
};
const crumbLink: React.CSSProperties = {
  color: "var(--color-fg-muted)",
  textDecoration: "none",
};
const chapterNav: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: "3rem",
  paddingTop: "1.5rem",
  borderTop: "1px solid var(--color-rule)",
};

// ── chapter-with-panel layout ─────────────────────────────────────────────
// Two-column reader: KJV text on the left, a docked commentary panel on the
// right. The panel stays in the layout flow (rather than overlaying) so the
// text column reflows to a comfortable measure when the panel is open.
const textColumn: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "auto",
  maxWidth: "var(--measure)",
  margin: "0 auto",
  padding: "2.5rem 2rem 6rem",
};
const panelOuter: React.CSSProperties = {
  flexShrink: 0,
  width: "min(420px, 38vw)",
  borderLeft: "1px solid var(--color-rule)",
  background: "var(--color-bg-elevated)",
  overflowY: "auto",
};
const panelInner: React.CSSProperties = {
  padding: "1.75rem 1.5rem 2rem",
};
const panelHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 12,
  marginBottom: "0.75rem",
  paddingBottom: "0.5rem",
  borderBottom: "1px solid var(--color-rule)",
};
const panelClose: React.CSSProperties = {
  background: "transparent",
  border: 0,
  padding: 0,
  font: "inherit",
  fontSize: 18,
  lineHeight: 1,
  color: "var(--color-fg-subtle)",
  cursor: "pointer",
};
const panelPlaceholder: React.CSSProperties = {
  color: "var(--color-fg-subtle)",
  fontStyle: "italic",
  fontSize: 14,
  margin: 0,
};
