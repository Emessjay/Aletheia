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
  if (group.isPending) return <div style={{ padding: 32 }}>Loading…</div>;
  if (group.isError)
    return (
      <div style={{ padding: 32, color: "var(--error, red)" }}>
        {group.error.message}
      </div>
    );
  if (!group.data) return <div style={{ padding: 32 }}>Group not found.</div>;

  return (
    <div style={{ padding: 32, maxWidth: 700 }}>
      <Link to="/study-groups" style={{ fontSize: 14, opacity: 0.7 }}>
        &larr; All groups
      </Link>
      <h2 style={{ margin: "8px 0 4px" }}>{group.data.name}</h2>
      <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>
        {group.data.member_count} member
        {group.data.member_count !== 1 ? "s" : ""} &middot; your role:{" "}
        {group.data.role} &middot; invite code:{" "}
        <code>{group.data.invite_code}</code>
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
      <h3 style={{ fontSize: 15, marginBottom: 8, opacity: 0.8 }}>
        Most discussed this week
      </h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {discussed.data.map((d) => (
          <li
            key={`${d.book_slug}-${d.chapter}-${d.verse}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "4px 0",
              fontSize: 14,
            }}
          >
            {/* Jump the feed below to this passage. */}
            <button
              onClick={() =>
                onPick({
                  work_slug: d.work_slug,
                  book_slug: d.book_slug,
                  chapter: d.chapter,
                  verse: d.verse,
                })
              }
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                color: "var(--color-accent, inherit)",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {bookDisplayName(d.book_slug)} {d.chapter}:{d.verse}
            </button>
            <span style={{ opacity: 0.6 }}>
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
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ fontSize: 15, margin: 0 }}>Feed &mdash; {passage}</h3>
        <button
          onClick={() => onAnchorChange({ ...anchor, verse: anchor.verse - 1 })}
          disabled={anchor.verse <= 1}
          aria-label="Previous verse"
          style={{ fontSize: 12 }}
        >
          &larr; Prev verse
        </button>
        <button
          onClick={() => onAnchorChange({ ...anchor, verse: anchor.verse + 1 })}
          aria-label="Next verse"
          style={{ fontSize: 12 }}
        >
          Next verse &rarr;
        </button>
        <Link to={readerUrl(anchor)} style={{ fontSize: 13 }}>
          Open in reader &rarr;
        </Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <textarea
          placeholder="Share your thoughts on this verse…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={3}
          style={{ width: "100%", padding: 8, resize: "vertical" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.5 }}>
            {body.length}/4000
          </span>
          <button
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
          <p style={{ color: "var(--error, red)", fontSize: 13 }}>
            {createPost.error.message}
          </p>
        )}
      </div>

      {feed.isPending && <p>Loading feed…</p>}
      {feed.isError && (
        <p style={{ color: "var(--error, red)" }}>{feed.error.message}</p>
      )}
      {feed.data?.length === 0 && (
        <p style={{ opacity: 0.6 }}>
          No posts on this verse yet. Be the first.
        </p>
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

  return (
    <div
      style={{
        border: "1px solid var(--border, #ddd)",
        borderRadius: 6,
        padding: 12,
        marginBottom: 10,
        opacity: isRemoved ? 0.5 : 1,
        background: post.status === "flagged"
          ? "var(--flagged-bg, #fff8e1)"
          : undefined,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>
        {/* Display name when the author has set one; UUID stub otherwise. */}
        <span style={{ fontWeight: 600 }}>
          {post.author_name ?? `${post.author_id.slice(0, 8)}…`}
        </span>{" "}
        &middot; {new Date(post.created_at).toLocaleString()}
        {post.status !== "visible" && (
          <span
            style={{
              marginLeft: 8,
              fontWeight: 600,
              color: isRemoved ? "var(--error, red)" : "orange",
            }}
          >
            [{post.status}]
          </span>
        )}
      </div>
      <p style={{ margin: "4px 0 8px", whiteSpace: "pre-wrap" }}>{post.body}</p>
      <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
        {post.reply_count != null && post.reply_count > 0 && (
          <span style={{ opacity: 0.6 }}>
            {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}
          </span>
        )}
        {status === "authenticated" && !isRemoved && (
          <button
            onClick={() => flagMut.mutate({ postId: post.id })}
            disabled={flagMut.isPending}
            style={{ fontSize: 12, cursor: "pointer" }}
          >
            Flag
          </button>
        )}
        {isModerator && !isRemoved && (
          <button
            onClick={() =>
              modMut.mutate({ postId: post.id, action: "remove" })
            }
            disabled={modMut.isPending}
            style={{ fontSize: 12, cursor: "pointer", color: "var(--error, red)" }}
          >
            Remove
          </button>
        )}
        {isModerator && isRemoved && (
          <button
            onClick={() =>
              modMut.mutate({ postId: post.id, action: "restore" })
            }
            disabled={modMut.isPending}
            style={{ fontSize: 12, cursor: "pointer" }}
          >
            Restore
          </button>
        )}
      </div>
    </div>
  );
}
