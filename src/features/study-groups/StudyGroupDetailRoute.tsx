import { useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { bookDisplayName } from "@/domain/reference";
import {
  useGroup,
  useFeed,
  useCreatePost,
  useFlagPost,
  useModeratePost,
  useDiscussed,
} from "./hooks";
import {
  anchorFromSearchParams,
  anchorToSearchParams,
  readerUrl,
  type FeedAnchor,
} from "./anchor";
import type { GroupPost } from "./types";
import { PostBody } from "./PostBody";
import { InviteCode } from "./InviteCode";
import "./studyGroups.css";

export function StudyGroupDetailRoute() {
  const { groupId } = useParams<{ groupId: string }>();
  // The feed anchor lives in the query string so a discussion is
  // bookmarkable and the reader's "Discuss" action can deep link here.
  const [searchParams, setSearchParams] = useSearchParams();
  const anchor = anchorFromSearchParams(searchParams);
  const setAnchor = (next: FeedAnchor) =>
    setSearchParams(anchorToSearchParams(next));
  const group = useGroup(groupId ?? "");

  if (!groupId) return <p>Missing group ID.</p>;
  if (group.isPending) return <div className="sg-page">Loading…</div>;
  if (group.isError)
    return (
      <div className="sg-page sg-error" style={{ fontSize: "inherit" }}>
        {group.error.message}
      </div>
    );
  if (!group.data) return <div className="sg-page">Group not found.</div>;

  return (
    <div className="sg-page">
      <Link to="/study-groups" className="sg-meta">
        &larr; All groups
      </Link>
      <h2 style={{ margin: "8px 0 4px" }}>{group.data.name}</h2>
      <div className="sg-meta" style={{ marginBottom: 16 }}>
        {group.data.member_count} member
        {group.data.member_count !== 1 ? "s" : ""} &middot; your role:{" "}
        {group.data.role} &middot; <InviteCode group={group.data} />
      </div>

      <DiscussedSection groupId={groupId} onPick={setAnchor} />
      <FeedSection
        groupId={groupId}
        role={group.data.role}
        anchor={anchor}
        onAnchorChange={setAnchor}
      />
    </div>
  );
}

function DiscussedSection({
  groupId,
  onPick,
}: {
  groupId: string;
  onPick: (anchor: FeedAnchor) => void;
}) {
  const discussed = useDiscussed(groupId);

  if (discussed.isPending || !discussed.data?.length) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 className="sg-meta" style={{ fontSize: 15, marginBottom: 8 }}>
        Most discussed this week
      </h3>
      <ul className="sg-discussed">
        {discussed.data.map((d) => (
          <li key={`${d.book_slug}-${d.chapter}-${d.verse}`}>
            {/* Jump the feed below to this passage. */}
            <button
              className="sg-linklike"
              onClick={() =>
                onPick({
                  work_slug: d.work_slug,
                  book_slug: d.book_slug,
                  chapter: d.chapter,
                  verse: d.verse,
                })
              }
            >
              {bookDisplayName(d.book_slug)} {d.chapter}:{d.verse}
            </button>
            <span className="sg-subtle">
              {d.post_count} posts &middot; {d.participant_count} people
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeedSection({
  groupId,
  role,
  anchor,
  onAnchorChange,
}: {
  groupId: string;
  role: "owner" | "moderator" | "member";
  anchor: FeedAnchor;
  onAnchorChange: (anchor: FeedAnchor) => void;
}) {
  const feed = useFeed(groupId, anchor);
  const createPost = useCreatePost(groupId);
  const [body, setBody] = useState("");
  const passage = `${bookDisplayName(anchor.book_slug)} ${anchor.chapter}:${anchor.verse}`;

  return (
    <div>
      <div className="sg-feed-header">
        <h3>Feed &mdash; {passage}</h3>
        <span style={{ display: "flex", gap: 8 }}>
          <button
            className="sg-btn"
            onClick={() =>
              onAnchorChange({ ...anchor, verse: anchor.verse - 1 })
            }
            disabled={anchor.verse <= 1}
            aria-label="Previous verse"
          >
            &larr; Prev verse
          </button>
          <button
            className="sg-btn"
            onClick={() =>
              onAnchorChange({ ...anchor, verse: anchor.verse + 1 })
            }
            aria-label="Next verse"
          >
            Next verse &rarr;
          </button>
        </span>
        <Link to={readerUrl(anchor)} style={{ fontSize: 13 }}>
          Open in reader &rarr;
        </Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <textarea
          className="sg-textarea"
          placeholder="Share your thoughts on this verse…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={3}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 6,
          }}
        >
          <span className="sg-subtle" style={{ fontSize: 12 }}>
            {body.length}/4000
          </span>
          <button
            className="sg-btn sg-btn--primary"
            onClick={() => {
              if (!body.trim()) return;
              createPost.mutate(
                { ...anchor, body: body.trim() },
                { onSuccess: () => setBody("") },
              );
            }}
            disabled={createPost.isPending || !body.trim()}
          >
            {createPost.isPending ? "Posting…" : "Post"}
          </button>
        </div>
        {createPost.isError && (
          <p className="sg-error">{createPost.error.message}</p>
        )}
      </div>

      {feed.isPending && <p>Loading feed…</p>}
      {feed.isError && <p className="sg-error">{feed.error.message}</p>}
      {feed.data?.length === 0 && (
        <p className="sg-meta">No posts on this verse yet. Be the first.</p>
      )}
      {feed.data?.map((post) => (
        <PostCard key={post.id} post={post} role={role} />
      ))}
    </div>
  );
}

function PostCard({
  post,
  role,
}: {
  post: GroupPost;
  role: "owner" | "moderator" | "member";
}) {
  const { status } = useAuth();
  const flagMut = useFlagPost();
  const modMut = useModeratePost();
  const isModerator = role === "owner" || role === "moderator";
  const isRemoved = post.status === "removed";

  const cardClass = [
    "sg-post",
    post.status === "flagged" ? "sg-post--flagged" : "",
    isRemoved ? "sg-post--removed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClass}>
      <div className="sg-meta" style={{ fontSize: 12, marginBottom: 4 }}>
        {/* Display name when the author has set one; UUID stub otherwise. */}
        <span className="sg-post-author">
          {post.author_name ?? `${post.author_id.slice(0, 8)}…`}
        </span>{" "}
        &middot; {new Date(post.created_at).toLocaleString()}
        {post.status !== "visible" && (
          <span className={`sg-status sg-status--${post.status}`}>
            [{post.status}]
          </span>
        )}
      </div>
      <PostBody body={post.body} groupId={post.group_id} />
      <div className="sg-post-actions">
        {post.reply_count != null && post.reply_count > 0 && (
          <span className="sg-subtle">
            {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}
          </span>
        )}
        {status === "authenticated" && !isRemoved && (
          <button
            className="sg-btn"
            onClick={() => flagMut.mutate({ postId: post.id })}
            disabled={flagMut.isPending}
          >
            Flag
          </button>
        )}
        {isModerator && !isRemoved && (
          <button
            className="sg-btn sg-btn--danger"
            onClick={() => modMut.mutate({ postId: post.id, action: "remove" })}
            disabled={modMut.isPending}
          >
            Remove
          </button>
        )}
        {isModerator && isRemoved && (
          <button
            className="sg-btn"
            onClick={() =>
              modMut.mutate({ postId: post.id, action: "restore" })
            }
            disabled={modMut.isPending}
          >
            Restore
          </button>
        )}
      </div>
    </div>
  );
}
