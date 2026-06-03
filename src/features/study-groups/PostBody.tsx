/**
 * Post bodies autolink scripture references — "compare Rom. 1:20" renders
 * as a link that jumps this group's feed to that verse, so a discussion can
 * cite passages the way commentaries do and readers can follow the chain
 * without leaving the conversation.
 *
 * Reuses the corpus-wide detector (domain/scriptureRefs) that already powers
 * patristic prose: it's deliberately conservative (Titlecase book + explicit
 * chapter required), because a false positive is worse than a miss when the
 * result is colored and clickable.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { findScriptureReferences } from "@/domain/scriptureRefs";
import { discussUrl } from "./anchor";
import "./studyGroups.css";

export function PostBody({ body, groupId }: { body: string; groupId: string }) {
  const refs = findScriptureReferences(body);
  if (refs.length === 0) return <p className="sg-post-body">{body}</p>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const ref of refs) {
    if (ref.start > cursor) parts.push(body.slice(cursor, ref.start));
    parts.push(
      <Link
        key={ref.start}
        className="sg-ref-link"
        to={discussUrl(groupId, {
          workSlug: "bible",
          bookSlug: ref.parsed.bookSlug,
          chapter: ref.parsed.chapter,
          // A chapter-only citation ("Ps. 19") lands on the chapter's
          // first verse rather than nowhere.
          verse: ref.parsed.verse ?? 1,
        })}
      >
        {ref.text}
      </Link>,
    );
    cursor = ref.end;
  }
  if (cursor < body.length) parts.push(body.slice(cursor));

  return <p className="sg-post-body">{parts}</p>;
}
