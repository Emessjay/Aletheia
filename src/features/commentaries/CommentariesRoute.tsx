import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  useChapterCommentary,
  useCommentaries,
  useCommentaryBooks,
  useCommentaryChapters,
} from "@/db/hooks";
import { isTauri } from "@/lib/tauri";
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

  if (!isTauri()) {
    return (
      <article style={wrap}>
        <p style={{ color: "var(--color-fg-muted)" }}>
          Run <code>./scripts/dev-instance.sh</code> to read commentaries.
        </p>
      </article>
    );
  }

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
  const chapters = useCommentaryChapters(workSlug, bookSlug);
  const numbers = useMemo(
    () => chapterNumbersFromSections(chapters.data ?? []),
    [chapters.data],
  );

  if (chapters.isPending) return <Loading />;
  if (chapters.isError) return <Failure error={chapters.error} />;
  // Skip the book-level index — there's nothing to read here on its own.
  if (numbers.length > 0) {
    return (
      <Navigate
        to={`/commentaries/${workSlug}/${bookSlug}/${numbers[0]}`}
        replace
      />
    );
  }
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

  const bookEntry = (books.data ?? []).find((b) => b.book_slug === bookSlug);
  const numbers = useMemo(
    () => chapterNumbersFromSections(chapters.data ?? []),
    [chapters.data],
  );
  const idx = numbers.indexOf(chapter);
  const prev = idx > 0 ? numbers[idx - 1] : null;
  const next = idx >= 0 && idx < numbers.length - 1 ? numbers[idx + 1] : null;

  if (sections.isPending) return <Loading />;
  if (sections.isError) return <Failure error={sections.error} />;

  const list = sections.data ?? [];
  const chapterIntro = list.find((s) => s.kind === "chapter");
  const comments = list.filter((s) => s.kind === "comment");

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
        title={`${bookEntry?.book_name ?? bookSlug} ${chapter}`}
      />

      {chapterIntro && chapterIntro.body.trim() ? (
        <SectionBody body={chapterIntro.body} />
      ) : null}

      {comments.length === 0 && !chapterIntro?.body?.trim() ? (
        <p style={{ color: "var(--color-fg-muted)" }}>
          No commentary text available for this chapter.
        </p>
      ) : null}

      {comments.map((c) => (
        <section key={c.id} style={{ marginTop: "1.5rem" }}>
          {c.label ? <p style={commentLabel}>{c.label}</p> : null}
          <SectionBody body={c.body} />
        </section>
      ))}

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
    </article>
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
